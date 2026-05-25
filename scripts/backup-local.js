#!/usr/bin/env node
/* eslint-disable no-console */

const { existsSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const BACKUP_TIME_ZONE = 'Asia/Shanghai';

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  const fs = require('node:fs');
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

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

function findPgDump() {
  const candidates = [
    process.env.PG_DUMP_PATH,
    '/www/server/pgsql/bin/pg_dump',
    '/www/server/postgresql/bin/pg_dump',
    'pg_dump',
  ].filter(Boolean);
  const found = candidates.find(candidate => candidate === 'pg_dump' || existsSync(candidate));
  if (!found) throw new Error('pg_dump not found. Set PG_DUMP_PATH or install PostgreSQL client tools.');
  return found;
}

function runPgDump(outputPath) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured.');

  const pgDump = findPgDump();
  const child = spawn(pgDump, [
    '--format=plain',
    '--no-owner',
    '--no-privileges',
    '--schema=clockin',
    '--file',
    outputPath,
    databaseUrl,
  ], {
    windowsHide: true,
    stdio: ['ignore', 'inherit', 'pipe'],
  });

  return new Promise((resolve, reject) => {
    const stderr = [];
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(stderr).toString('utf8') || `pg_dump exited with code ${code}`));
    });
  });
}

async function main() {
  loadEnv(path.join(process.cwd(), '.env.local'));
  const backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
  mkdirSync(backupDir, { recursive: true });
  const filePath = path.join(backupDir, `clockin-db-${stamp()}.sql`);
  await runPgDump(filePath);
  console.log(`Backup written: ${filePath}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
