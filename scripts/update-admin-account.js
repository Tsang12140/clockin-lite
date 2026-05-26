#!/usr/bin/env node
// 临时脚本：更新管理员账号和密码
// 用法：node scripts/update-admin-account.js

const NEW_PHONE    = '2025';
const NEW_PASSWORD = '2026';

const { Pool } = require('pg');
const { scrypt, randomBytes } = require('node:crypto');
const { promisify } = require('node:util');
const fs   = require('node:fs');
const path = require('node:path');

const scryptAsync = promisify(scrypt);

function loadEnv() {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

async function hashPassword(plain) {
  const saltHex = randomBytes(16).toString('hex');
  const hash = await scryptAsync(plain, saltHex, 64);
  return `scrypt:${saltHex}:${hash.toString('hex')}`;
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    console.error('错误：未找到 DATABASE_URL');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });

  try {
    const passwordHash = await hashPassword(NEW_PASSWORD);
    const r = await pool.query(
      `UPDATE clockin.admin_users SET phone = $1, password_hash = $2 WHERE id = 1 RETURNING phone`,
      [NEW_PHONE, passwordHash]
    );
    if (r.rowCount === 0) {
      console.error('没找到 id=1 的管理员，请检查数据库');
    } else {
      console.log(`✓ 账号已更新为：${NEW_PHONE}，密码已更新为：${NEW_PASSWORD}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error('失败：', e.message); process.exit(1); });
