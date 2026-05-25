import 'server-only';

import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { isVirtualDbEnabled, virtualBackupSql } from '@/lib/virtualDb';

const BACKUP_TIME_ZONE = 'Asia/Shanghai';
const MAX_MANUAL_BACKUP_BYTES = 100 * 1024 * 1024;

function stamp() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BACKUP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}-${values.hour}${values.minute}${values.second}`;
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured');
  return databaseUrl;
}

function findPgDump() {
  const candidates = [
    process.env.PG_DUMP_PATH,
    '/www/server/pgsql/bin/pg_dump',
    '/www/server/postgresql/bin/pg_dump',
    'pg_dump',
  ].filter((item): item is string => Boolean(item));

  const found = candidates.find(candidate => candidate === 'pg_dump' || existsSync(candidate));
  if (!found) throw new Error('pg_dump not found. Set PG_DUMP_PATH or install PostgreSQL client tools.');
  return found;
}

function pgDumpArgs(databaseUrl: string, outputPath?: string) {
  const args = [
    '--format=plain',
    '--no-owner',
    '--no-privileges',
    '--schema=clockin',
  ];
  if (outputPath) args.push('--file', outputPath);
  args.push(databaseUrl);
  return args;
}

function runPgDump(outputPath?: string): Promise<Buffer> {
  const pgDump = findPgDump();
  const databaseUrl = getDatabaseUrl();

  return new Promise((resolve, reject) => {
    const child = spawn(pgDump, pgDumpArgs(databaseUrl, outputPath), {
      windowsHide: true,
      stdio: outputPath ? ['ignore', 'ignore', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let size = 0;

    child.stdout?.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_MANUAL_BACKUP_BYTES) {
        child.kill();
        reject(new Error('Backup is larger than the manual download limit.'));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr?.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString('utf8') || `pg_dump exited with code ${code}`));
    });
  });
}

export function backupFileName() {
  return `clockin-db-${stamp()}.sql`;
}

export async function createManualSqlBackup(): Promise<{ filename: string; data: Buffer }> {
  if (isVirtualDbEnabled()) {
    return {
      filename: backupFileName().replace('clockin-db-', 'clockin-virtual-'),
      data: Buffer.from(virtualBackupSql(), 'utf8'),
    };
  }
  return {
    filename: backupFileName(),
    data: await runPgDump(),
  };
}

export async function createLocalSqlBackup(): Promise<{ filename: string; filePath: string }> {
  if (isVirtualDbEnabled()) {
    throw new Error('Virtual storage does not support server-side local backup files.');
  }
  const backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
  await mkdir(backupDir, { recursive: true });
  const filename = backupFileName();
  const filePath = path.join(backupDir, filename);
  await runPgDump(filePath);
  return { filename, filePath };
}
