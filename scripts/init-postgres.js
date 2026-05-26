#!/usr/bin/env node
/**
 * 一次性初始化脚本：在 postgres 模式下预建表、写入工厂信息和管理员账号。
 * 用法：node scripts/init-postgres.js
 *
 * 修改下方 CONFIG 里的三项，然后在服务器项目根目录执行一次即可。
 * 已初始化过的不会重复执行（有幂等保护）。
 */

// ================================================================
// ✏️  在这里填你的工厂名、手机号、6位数字密码
// ================================================================
const CONFIG = {
  factoryShortName: '蛋妞',   // 工厂简称（1-10字）
  phone:            '2025',   // 管理员账号
  password:         '2026',   // 登录密码
};
// ================================================================

const { Pool } = require('pg');
const { scrypt, randomBytes } = require('node:crypto');
const { promisify } = require('node:util');
const fs   = require('node:fs');
const path = require('node:path');

const scryptAsync = promisify(scrypt);

function loadDotEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined) continue;
    let val = raw;
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

async function hashPassword(plain) {
  const saltHex = randomBytes(16).toString('hex');
  const hash = await scryptAsync(plain, saltHex, 64);
  return `scrypt:${saltHex}:${hash.toString('hex')}`;
}

async function main() {
  loadDotEnvLocal();

  if (!process.env.DATABASE_URL) {
    console.error('错误：未找到 DATABASE_URL，请检查 .env.local');
    process.exit(1);
  }

  if (!CONFIG.phone.trim()) {
    console.error('错误：phone 不能为空');
    process.exit(1);
  }
  if (!CONFIG.password.trim()) {
    console.error('错误：password 不能为空');
    process.exit(1);
  }
  if (!CONFIG.factoryShortName.trim() || CONFIG.factoryShortName.length > 10) {
    console.error('错误：factoryShortName 需为 1-10 字');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // 1. 建 schema
    await pool.query('CREATE SCHEMA IF NOT EXISTS clockin');
    console.log('✓ schema clockin 就绪');

    // 2. 建 tenant_config 表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clockin.tenant_config (
        id                                    INTEGER PRIMARY KEY DEFAULT 1,
        factory_short_name                    TEXT,
        logo_base64                           TEXT,
        work_schedule                         JSONB,
        weather_provider                      TEXT,
        weather_encrypted_key                 TEXT,
        weather_location_id                   TEXT,
        weather_city                          TEXT,
        weather_api_host                      TEXT,
        weather_enabled                       BOOLEAN NOT NULL DEFAULT TRUE,
        work_start_time                       TEXT,
        work_end_time                         TEXT,
        lunch_start_time                      TEXT,
        lunch_end_time                        TEXT,
        overtime_standard_hours               NUMERIC(4,1)  NOT NULL DEFAULT 8.0,
        overtime_weekday_multiplier           NUMERIC(3,2)  NOT NULL DEFAULT 1.00,
        overtime_weekday_overtime_multiplier  NUMERIC(3,2)  NOT NULL DEFAULT 1.00,
        overtime_weekend_multiplier           NUMERIC(3,2)  NOT NULL DEFAULT 1.00,
        overtime_legal_holiday_multiplier     NUMERIC(3,2)  NOT NULL DEFAULT 1.00,
        developer_mode                        BOOLEAN NOT NULL DEFAULT FALSE,
        demo_mode                             BOOLEAN NOT NULL DEFAULT FALSE,
        setup_completed_at                    TIMESTAMPTZ,
        updated_at                            TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT tenant_config_singleton CHECK (id = 1)
      )
    `);

    // 3. 建 admin_users 表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clockin.admin_users (
        id            SERIAL PRIMARY KEY,
        phone         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'admin',
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      )
    `);

    // 4. 建 login_attempts 表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clockin.login_attempts (
        id                 SERIAL PRIMARY KEY,
        ip_address         TEXT,
        device_id          TEXT,
        fingerprint_hash   TEXT,
        username_attempted TEXT,
        attempt_type       TEXT NOT NULL,
        success            BOOLEAN NOT NULL,
        attempted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✓ 核心表就绪');

    // 5. 检查是否已初始化
    const existing = await pool.query(
      'SELECT setup_completed_at FROM clockin.tenant_config WHERE id = 1'
    );
    if (existing.rows[0]?.setup_completed_at) {
      console.log('⚠️  已经初始化过，跳过（如需重置请手动清空数据库）');
      return;
    }

    // 6. 写管理员账号（幂等）
    const passwordHash = await hashPassword(CONFIG.password);
    const adminResult = await pool.query(`
      INSERT INTO clockin.admin_users (phone, password_hash, role)
      VALUES ($1, $2, 'admin')
      ON CONFLICT (phone) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id
    `, [CONFIG.phone, passwordHash]);
    const adminId = adminResult.rows[0].id;
    console.log(`✓ 管理员账号写入：${CONFIG.phone}`);

    // 7. 写工厂信息 + 标记初始化完成
    await pool.query(`
      INSERT INTO clockin.tenant_config (id, factory_short_name, setup_completed_at, updated_at)
      VALUES (1, $1, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE
        SET factory_short_name  = EXCLUDED.factory_short_name,
            setup_completed_at  = NOW(),
            updated_at          = NOW()
    `, [CONFIG.factoryShortName]);
    console.log(`✓ 工厂简称写入：${CONFIG.factoryShortName}`);

    console.log('\n🎉 初始化完成！');
    console.log(`   工厂名：${CONFIG.factoryShortName}`);
    console.log(`   手机号：${CONFIG.phone}`);
    console.log(`   密  码：${CONFIG.password}`);
    console.log('\n   现在重启 PM2，直接访问 /login 即可登录。');

    void adminId;
  } catch (err) {
    console.error('初始化失败：', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
