#!/usr/bin/env node
/**
 * Reset an admin password from the command line.
 * Usage:  npm run reset-admin-password
 *
 * Prompts for: phone, new password (6 digits), confirm.
 * Writes a fresh scrypt hash matching lib/password.ts format.
 */

const { Pool } = require('pg');
const { scrypt, randomBytes } = require('node:crypto');
const { promisify } = require('node:util');
const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');

const scryptAsync = promisify(scrypt);

function loadDotEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  content.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) return;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) return;
    let value = rawValue;
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

function prompt(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function hashPassword(plain) {
  const saltHex = randomBytes(16).toString('hex');
  const hash = await scryptAsync(plain, saltHex, 64);
  return `scrypt:${saltHex}:${hash.toString('hex')}`;
}

async function main() {
  loadDotEnvLocal();

  if (!process.env.DATABASE_URL) {
    console.error('错误：未找到 DATABASE_URL（请检查 .env.local）');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const existing = await pool.query(
      'SELECT phone FROM clockin.admin_users ORDER BY id'
    );

    if (existing.rows.length === 0) {
      console.error('当前数据库中没有管理员账号。请先访问 /setup 完成首启向导。');
      process.exit(1);
    }

    console.log('\n当前管理员账号：');
    existing.rows.forEach((row, idx) => {
      console.log(`  ${idx + 1}. ${row.phone}`);
    });
    console.log('');

    const phone = await prompt('请输入要重置密码的手机号: ');
    if (!/^\d{11}$/.test(phone)) {
      console.error('手机号必须是 11 位数字。');
      process.exit(1);
    }

    const checkResult = await pool.query(
      'SELECT id FROM clockin.admin_users WHERE phone = $1',
      [phone]
    );
    if (checkResult.rows.length === 0) {
      console.error(`未找到手机号为 ${phone} 的管理员。`);
      process.exit(1);
    }

    const password = await prompt('请输入新密码（6 位数字）: ');
    if (!/^\d{6}$/.test(password)) {
      console.error('密码必须是 6 位数字。');
      process.exit(1);
    }

    const confirm = await prompt('再次确认新密码: ');
    if (confirm !== password) {
      console.error('两次输入的密码不一致。');
      process.exit(1);
    }

    const passwordHash = await hashPassword(password);
    await pool.query(
      'UPDATE clockin.admin_users SET password_hash = $1 WHERE phone = $2',
      [passwordHash, phone]
    );

    // Also clear any in-progress lockouts for this phone.
    await pool.query(
      `DELETE FROM clockin.login_attempts
       WHERE username_attempted = $1 AND success = false`,
      [phone]
    );

    console.log(`\n✓ 已重置管理员 ${phone} 的密码，并清除该账号的失败尝试记录。`);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('执行失败：', err);
  process.exit(1);
});
