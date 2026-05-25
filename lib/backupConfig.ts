import 'server-only';

import { db } from '@/db';
import { backupConfig as backupConfigTable, backupRuns } from '@/db/schema';
import type { BackupRun } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '@/lib/tenant';
import { isVirtualDbEnabled } from '@/lib/virtualDb';

let tablesReady: Promise<void> | null = null;

export type S3BackupConfig = {
  enabled: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
};

export type S3BackupStatus = {
  source: 'env' | 'db' | 'none';
  enabled: boolean;
  hasCredentials: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  forcePathStyle: boolean;
  updatedAt: string | null;
};

type BackupConfigRow = {
  id: number;
  s3_enabled: boolean;
  s3_endpoint: string | null;
  s3_region: string | null;
  s3_bucket: string | null;
  s3_prefix: string | null;
  s3_force_path_style: boolean;
  s3_encrypted_access_key_id: string | null;
  s3_encrypted_secret_access_key: string | null;
  updated_at: string | Date | null;
};

export async function ensureBackupTables(): Promise<void> {
  if (isVirtualDbEnabled()) return;
  if (!tablesReady) {
    tablesReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clockin.backup_config (
          id                             INTEGER PRIMARY KEY DEFAULT 1,
          s3_enabled                     BOOLEAN NOT NULL DEFAULT FALSE,
          s3_endpoint                    TEXT,
          s3_region                      TEXT,
          s3_bucket                      TEXT,
          s3_prefix                      TEXT,
          s3_force_path_style            BOOLEAN NOT NULL DEFAULT TRUE,
          s3_encrypted_access_key_id     TEXT,
          s3_encrypted_secret_access_key TEXT,
          updated_at                     TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT backup_config_singleton CHECK (id = 1)
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clockin.backup_runs (
          id          SERIAL PRIMARY KEY,
          provider    TEXT NOT NULL,
          kind        TEXT NOT NULL,
          status      TEXT NOT NULL,
          file_name   TEXT,
          location    TEXT,
          size_bytes  INTEGER,
          error       TEXT,
          started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          finished_at TIMESTAMPTZ
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS backup_runs_started_at_idx
        ON clockin.backup_runs (started_at DESC)
      `);
    })().catch(err => {
      tablesReady = null;
      throw err;
    });
  }
  return tablesReady;
}

async function ensureBackupConfigRow() {
  await ensureBackupTables();
  await db.execute(sql`
    INSERT INTO clockin.backup_config (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);
}

async function getBackupConfigRow(): Promise<BackupConfigRow | null> {
  await ensureBackupTables();
  const result = await db.execute(sql`
    SELECT * FROM clockin.backup_config WHERE id = 1 LIMIT 1
  `) as unknown as { rows?: BackupConfigRow[] };
  return result.rows?.[0] ?? null;
}

function envS3Config(): S3BackupConfig | null {
  const bucket = (process.env.BACKUP_S3_BUCKET ?? '').trim();
  const accessKeyId = (process.env.BACKUP_S3_ACCESS_KEY_ID ?? '').trim();
  const secretAccessKey = (process.env.BACKUP_S3_SECRET_ACCESS_KEY ?? '').trim();
  if (!bucket || !accessKeyId || !secretAccessKey) return null;

  return {
    enabled: process.env.BACKUP_S3_ENABLED !== 'false',
    endpoint: (process.env.BACKUP_S3_ENDPOINT ?? 'https://s3.amazonaws.com').trim(),
    region: (process.env.BACKUP_S3_REGION ?? 'us-east-1').trim(),
    bucket,
    prefix: (process.env.BACKUP_S3_PREFIX ?? 'backups/db').trim(),
    forcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE !== 'false',
    accessKeyId,
    secretAccessKey,
  };
}

export async function getS3BackupStatus(): Promise<S3BackupStatus> {
  if (isVirtualDbEnabled()) {
    return {
      source: 'none',
      enabled: false,
      hasCredentials: false,
      endpoint: '',
      region: '',
      bucket: '',
      prefix: 'backups/db',
      forcePathStyle: true,
      updatedAt: null,
    };
  }
  const envConfig = envS3Config();
  if (envConfig) {
    return {
      source: 'env',
      enabled: envConfig.enabled,
      hasCredentials: true,
      endpoint: envConfig.endpoint,
      region: envConfig.region,
      bucket: envConfig.bucket,
      prefix: envConfig.prefix,
      forcePathStyle: envConfig.forcePathStyle,
      updatedAt: null,
    };
  }

  try {
    const row = await getBackupConfigRow();
    if (!row) {
      return {
        source: 'none',
        enabled: false,
        hasCredentials: false,
        endpoint: '',
        region: '',
        bucket: '',
        prefix: 'backups/db',
        forcePathStyle: true,
        updatedAt: null,
      };
    }
    const accessKeyId = decryptSecret(row.s3_encrypted_access_key_id);
    const secretAccessKey = decryptSecret(row.s3_encrypted_secret_access_key);
    return {
      source: accessKeyId && secretAccessKey ? 'db' : 'none',
      enabled: row.s3_enabled,
      hasCredentials: Boolean(accessKeyId && secretAccessKey),
      endpoint: row.s3_endpoint ?? '',
      region: row.s3_region ?? '',
      bucket: row.s3_bucket ?? '',
      prefix: row.s3_prefix ?? 'backups/db',
      forcePathStyle: row.s3_force_path_style,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
  } catch {
    return {
      source: 'none',
      enabled: false,
      hasCredentials: false,
      endpoint: '',
      region: '',
      bucket: '',
      prefix: 'backups/db',
      forcePathStyle: true,
      updatedAt: null,
    };
  }
}

export async function getResolvedS3BackupConfig(): Promise<S3BackupConfig | null> {
  if (isVirtualDbEnabled()) return null;
  const envConfig = envS3Config();
  if (envConfig?.enabled) return envConfig;

  const row = await getBackupConfigRow();
  if (!row?.s3_enabled) return null;

  const accessKeyId = decryptSecret(row.s3_encrypted_access_key_id);
  const secretAccessKey = decryptSecret(row.s3_encrypted_secret_access_key);
  if (!accessKeyId || !secretAccessKey || !row.s3_bucket || !row.s3_endpoint || !row.s3_region) return null;

  return {
    enabled: row.s3_enabled,
    endpoint: row.s3_endpoint,
    region: row.s3_region,
    bucket: row.s3_bucket,
    prefix: row.s3_prefix ?? 'backups/db',
    forcePathStyle: row.s3_force_path_style,
    accessKeyId,
    secretAccessKey,
  };
}

export async function saveS3BackupConfig(input: {
  enabled: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  forcePathStyle: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
}) {
  if (isVirtualDbEnabled()) return;
  await ensureBackupConfigRow();
  const patch: Partial<typeof backupConfigTable.$inferInsert> = {
    s3Enabled: input.enabled,
    s3Endpoint: input.endpoint.trim(),
    s3Region: input.region.trim(),
    s3Bucket: input.bucket.trim(),
    s3Prefix: input.prefix.trim() || 'backups/db',
    s3ForcePathStyle: input.forcePathStyle,
    updatedAt: new Date(),
  };
  if (input.accessKeyId?.trim()) {
    patch.s3EncryptedAccessKeyId = encryptSecret(input.accessKeyId.trim());
  }
  if (input.secretAccessKey?.trim()) {
    patch.s3EncryptedSecretAccessKey = encryptSecret(input.secretAccessKey.trim());
  }

  await db.update(backupConfigTable)
    .set(patch)
    .where(eq(backupConfigTable.id, 1));
}

export async function listBackupRuns(limit = 20): Promise<BackupRun[]> {
  if (isVirtualDbEnabled()) return [];
  await ensureBackupTables();
  return db.select().from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(limit);
}

export async function recordBackupRun(input: {
  provider: string;
  kind: string;
  status: string;
  fileName?: string | null;
  location?: string | null;
  sizeBytes?: number | null;
  error?: string | null;
  startedAt?: Date;
  finishedAt?: Date;
}) {
  if (isVirtualDbEnabled()) return;
  await ensureBackupTables();
  await db.insert(backupRuns).values({
    provider: input.provider,
    kind: input.kind,
    status: input.status,
    fileName: input.fileName ?? null,
    location: input.location ?? null,
    sizeBytes: input.sizeBytes ?? null,
    error: input.error ?? null,
    startedAt: input.startedAt ?? new Date(),
    finishedAt: input.finishedAt ?? new Date(),
  });
}
