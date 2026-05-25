'use server';

import { revalidatePath } from 'next/cache';
import { createManualSqlBackup } from '@/lib/backup';
import {
  getResolvedS3BackupConfig,
  getS3BackupStatus,
  recordBackupRun,
  saveS3BackupConfig,
} from '@/lib/backupConfig';
import { uploadS3Object } from '@/lib/s3Backup';
import { generateSummaryExcel } from '@/lib/exportSummary';
import { recordAuditLog } from '@/lib/audit';
import { requireAuth } from '@/lib/requireAuth';

type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function saveS3ConfigAction(input: {
  enabled: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  forcePathStyle: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
}): Promise<ActionResult> {
  const session = await requireAuth();
  const endpoint = input.endpoint.trim();
  const region = input.region.trim();
  const bucket = input.bucket.trim();
  const prefix = input.prefix.trim() || 'backups/db';
  const existing = await getS3BackupStatus();

  if (input.enabled) {
    if (!endpoint || !region || !bucket) {
      return { ok: false, error: 'Endpoint、Region 和 Bucket 不能为空。' };
    }
    if (!input.accessKeyId?.trim() && !existing.hasCredentials) {
      return { ok: false, error: '请填写 Access Key。' };
    }
    if (!input.secretAccessKey?.trim() && !existing.hasCredentials) {
      return { ok: false, error: '请填写 Secret Key。' };
    }
  }

  await saveS3BackupConfig({
    enabled: input.enabled,
    endpoint,
    region,
    bucket,
    prefix,
    forcePathStyle: input.forcePathStyle,
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
  });
  await recordAuditLog({
    action: 'save_backup_config',
    actionLabel: '修改备份配置',
    pageUrl: '/settings/backup',
    user: session,
    detail: { enabled: input.enabled, bucket, prefix },
  });
  revalidatePath('/settings/backup');
  return { ok: true, message: '备份配置已保存。' };
}

export async function uploadS3BackupNowAction(): Promise<ActionResult> {
  const session = await requireAuth();
  const startedAt = new Date();
  try {
    const config = await getResolvedS3BackupConfig();
    if (!config) return { ok: false, error: 'S3 备份还没有配置完整。' };

    const dbPrefix = config.prefix.replace(/^\/+|\/+$/g, '') || 'backups/db';
    const excelParts = dbPrefix.split('/');
    excelParts[excelParts.length - 1] = 'excel';
    const excelPrefix = excelParts.join('/');

    const [backup, excel] = await Promise.all([
      createManualSqlBackup(),
      generateSummaryExcel(),
    ]);

    const dbKey = `${dbPrefix}/${backup.filename}`;
    const excelKey = `${excelPrefix}/${excel.filename}`;
    const [dbLocation, excelLocation] = await Promise.all([
      uploadS3Object(config, dbKey, backup.data, 'application/sql; charset=utf-8'),
      uploadS3Object(config, excelKey, excel.data, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ]);

    await Promise.all([
      recordBackupRun({
        provider: 's3', kind: 'manual', status: 'success',
        fileName: backup.filename, location: dbLocation,
        sizeBytes: backup.data.length, startedAt, finishedAt: new Date(),
      }),
      recordBackupRun({
        provider: 's3', kind: 'manual', status: 'success',
        fileName: excel.filename, location: excelLocation,
        sizeBytes: excel.data.length, startedAt, finishedAt: new Date(),
      }),
    ]);
    await recordAuditLog({
      action: 'upload_s3_backup',
      actionLabel: '上传 S3 备份',
      pageUrl: '/settings/backup',
      user: session,
      detail: { dbFile: backup.filename, excelFile: excel.filename, bucket: config.bucket },
    });
    revalidatePath('/settings/backup');
    return { ok: true, message: 'S3 备份已上传（数据库 + 总表）。' };
  } catch (error) {
    const message = error instanceof Error ? error.message : '上传失败';
    await recordBackupRun({
      provider: 's3',
      kind: 'manual',
      status: 'failed',
      error: message,
      startedAt,
      finishedAt: new Date(),
    }).catch(() => {});
    revalidatePath('/settings/backup');
    return { ok: false, error: message };
  }
}
