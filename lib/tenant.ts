import { db } from '@/db';
import { sql, eq } from 'drizzle-orm';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { tenantConfig as tenantConfigTable, type TenantConfig, type WorkScheduleConfig } from '@/db/schema';
import { normalizeOvertimeMultipliers, type OvertimeMultipliers } from '@/lib/overtime';

// ============================================================
// Table bootstrap (lazy "CREATE TABLE IF NOT EXISTS" style,
// mirrors lib/audit.ts pattern — no Drizzle migrations).
// ============================================================

let tablesReady: Promise<void> | null = null;

export async function ensureTenantTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      try {
        await db.execute(sql`CREATE SCHEMA IF NOT EXISTS clockin`);
      } catch {
        const r = await db.execute(sql`
          SELECT 1 FROM information_schema.schemata WHERE schema_name = 'clockin'
        `) as unknown as { rows?: unknown[] };
        if (!r.rows?.length) throw new Error('clockin schema does not exist and could not be created');
      }
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clockin.tenant_config (
          id                                INTEGER PRIMARY KEY DEFAULT 1,
          factory_short_name                TEXT,
          logo_base64                       TEXT,
          work_schedule                     JSONB,
          weather_provider                  TEXT,
          weather_encrypted_key             TEXT,
          weather_location_id               TEXT,
          weather_city                      TEXT,
          overtime_standard_hours           NUMERIC(4,1) NOT NULL DEFAULT 8.0,
          overtime_weekday_multiplier       NUMERIC(3,2) NOT NULL DEFAULT 1.00,
          overtime_weekday_overtime_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.00,
          overtime_weekend_multiplier       NUMERIC(3,2) NOT NULL DEFAULT 1.00,
          overtime_legal_holiday_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.00,
          developer_mode                    BOOLEAN NOT NULL DEFAULT FALSE,
          demo_mode                         BOOLEAN NOT NULL DEFAULT FALSE,
          setup_completed_at                TIMESTAMPTZ,
          updated_at                        TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT tenant_config_singleton CHECK (id = 1)
        )
      `);
      await db.execute(sql`
        ALTER TABLE clockin.tenant_config
        ADD COLUMN IF NOT EXISTS weather_provider TEXT,
        ADD COLUMN IF NOT EXISTS weather_encrypted_key TEXT,
        ADD COLUMN IF NOT EXISTS weather_location_id TEXT,
        ADD COLUMN IF NOT EXISTS weather_city TEXT,
        ADD COLUMN IF NOT EXISTS weather_api_host TEXT,
        ADD COLUMN IF NOT EXISTS weather_enabled BOOLEAN NOT NULL DEFAULT TRUE
      `);
      await db.execute(sql`
        ALTER TABLE clockin.tenant_config
        ADD COLUMN IF NOT EXISTS work_schedule JSONB,
        ADD COLUMN IF NOT EXISTS overtime_standard_hours NUMERIC(4,1) NOT NULL DEFAULT 8.0,
        ADD COLUMN IF NOT EXISTS overtime_weekday_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.00,
        ADD COLUMN IF NOT EXISTS overtime_weekday_overtime_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.00,
        ADD COLUMN IF NOT EXISTS overtime_weekend_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.00,
        ADD COLUMN IF NOT EXISTS overtime_legal_holiday_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.00,
        ADD COLUMN IF NOT EXISTS developer_mode BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS demo_mode BOOLEAN NOT NULL DEFAULT FALSE
      `);
      await db.execute(sql`
        ALTER TABLE clockin.tenant_config
        ADD COLUMN IF NOT EXISTS work_start_time TEXT,
        ADD COLUMN IF NOT EXISTS work_end_time TEXT,
        ADD COLUMN IF NOT EXISTS lunch_start_time TEXT,
        ADD COLUMN IF NOT EXISTS lunch_end_time TEXT
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clockin.admin_users (
          id            SERIAL PRIMARY KEY,
          phone         TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role          TEXT NOT NULL DEFAULT 'admin',
          created_at    TIMESTAMPTZ DEFAULT NOW(),
          last_login_at TIMESTAMPTZ
        )
      `);
      await db.execute(sql`
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
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS login_attempts_at_ip_idx
        ON clockin.login_attempts (attempted_at DESC, ip_address)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS login_attempts_at_device_idx
        ON clockin.login_attempts (attempted_at DESC, device_id)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS login_attempts_at_fp_idx
        ON clockin.login_attempts (attempted_at DESC, fingerprint_hash)
      `);

      // ---- Business tables (dependency order: positions → employees → children) ----

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clockin.work_status_types (
          id         SERIAL PRIMARY KEY,
          label      TEXT NOT NULL,
          is_paid    BOOLEAN NOT NULL DEFAULT FALSE,
          is_default BOOLEAN NOT NULL DEFAULT FALSE
        )
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clockin.positions (
          id                  SERIAL PRIMARY KEY,
          name                TEXT NOT NULL,
          default_hourly_rate NUMERIC(10,2),
          created_at          TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clockin.employees (
          id                  SERIAL PRIMARY KEY,
          name                TEXT NOT NULL,
          gender              TEXT DEFAULT 'unknown',
          phone               TEXT,
          id_card             TEXT,
          position_id         INTEGER REFERENCES clockin.positions(id),
          status              TEXT DEFAULT 'active',
          hire_date           DATE NOT NULL,
          leave_date          DATE,
          current_hourly_rate NUMERIC(10,2),
          notes               TEXT,
          is_demo             BOOLEAN NOT NULL DEFAULT FALSE,
          created_at          TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clockin.employee_aliases (
          id          SERIAL PRIMARY KEY,
          employee_id INTEGER NOT NULL REFERENCES clockin.employees(id),
          alias       TEXT NOT NULL,
          created_at  TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT employee_aliases_employee_alias UNIQUE (employee_id, alias)
        )
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clockin.hourly_rate_history (
          id             SERIAL PRIMARY KEY,
          employee_id    INTEGER REFERENCES clockin.employees(id),
          rate           NUMERIC(10,2) NOT NULL,
          effective_date DATE NOT NULL,
          notes          TEXT,
          is_demo        BOOLEAN NOT NULL DEFAULT FALSE,
          created_at     TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clockin.attendance_records (
          id           SERIAL PRIMARY KEY,
          employee_id  INTEGER REFERENCES clockin.employees(id),
          work_date    DATE NOT NULL,
          hours        NUMERIC(5,1),
          status       TEXT DEFAULT 'worked',
          status_label TEXT,
          note         TEXT,
          is_locked    BOOLEAN NOT NULL DEFAULT FALSE,
          is_demo      BOOLEAN NOT NULL DEFAULT FALSE,
          created_at   TIMESTAMPTZ DEFAULT NOW(),
          updated_at   TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT attendance_employee_date UNIQUE (employee_id, work_date)
        )
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clockin.holidays (
          id         SERIAL PRIMARY KEY,
          date       DATE NOT NULL UNIQUE,
          name       TEXT NOT NULL,
          type       TEXT DEFAULT 'legal',
          is_paid    BOOLEAN DEFAULT TRUE,
          is_demo    BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clockin.backup_config (
          id                          INTEGER PRIMARY KEY DEFAULT 1,
          s3_enabled                  BOOLEAN NOT NULL DEFAULT FALSE,
          s3_endpoint                 TEXT,
          s3_region                   TEXT,
          s3_bucket                   TEXT,
          s3_prefix                   TEXT,
          s3_force_path_style         BOOLEAN NOT NULL DEFAULT TRUE,
          s3_encrypted_access_key_id  TEXT,
          s3_encrypted_secret_access_key TEXT,
          updated_at                  TIMESTAMPTZ DEFAULT NOW(),
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
    })().catch(err => {
      tablesReady = null;
      throw err;
    });
  }
  return tablesReady;
}

// ============================================================
// Encryption helpers (AES-256-GCM, key derived from SESSION_SECRET).
// Format:  aes-256-gcm:{ivHex}:{tagHex}:{ciphertextHex}
// Mirrors lib/ai/config.ts crypto choices.
// ============================================================

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'development') {
      return scryptSync('clockin-local-dev-only-not-for-production', 'clockin-tenant', 32);
    }
    throw new Error('SESSION_SECRET must be set');
  }
  return scryptSync(secret, 'clockin-tenant', 32);
}

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes-256-gcm:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSecret(encrypted: string | null | undefined): string {
  if (!encrypted) return '';
  const parts = encrypted.split(':');
  if (parts.length !== 4 || parts[0] !== 'aes-256-gcm') return '';
  try {
    const [, ivHex, tagHex, ctHex] = parts;
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

// ============================================================
// Setup state — cached, hit DB at most every 30s.
// Once setup is true it stays true (cannot be undone), so we cache forever.
// ============================================================

let setupCache: { value: boolean; expiresAt: number } | null = null;
const SETUP_CACHE_TTL_MS = 30_000;

export function invalidateTenantCache(): void {
  setupCache = null;
}

export async function isSetupCompleted(): Promise<boolean> {
  if (setupCache?.value === true) return true;
  if (setupCache && Date.now() < setupCache.expiresAt) return setupCache.value;
  try {
    await ensureTenantTables();
    const result = await db.execute(sql`
      SELECT setup_completed_at FROM clockin.tenant_config WHERE id = 1 LIMIT 1
    `) as unknown as { rows?: Array<{ setup_completed_at: unknown }> };
    const completed = result.rows?.[0]?.setup_completed_at != null;
    setupCache = { value: completed, expiresAt: Date.now() + SETUP_CACHE_TTL_MS };
    return completed;
  } catch {
    return false;
  }
}

// ============================================================
// Read / write tenant config.
// ============================================================

type TenantRow = {
  id: number;
  factory_short_name: string | null;
  logo_base64: string | null;
  work_schedule: WorkScheduleConfig | null;
  weather_provider: string | null;
  weather_encrypted_key: string | null;
  weather_location_id: string | null;
  weather_city: string | null;
  weather_api_host: string | null;
  weather_enabled: boolean;
  work_start_time: string | null;
  work_end_time: string | null;
  lunch_start_time: string | null;
  lunch_end_time: string | null;
  overtime_standard_hours: string;
  overtime_weekday_multiplier: string;
  overtime_weekday_overtime_multiplier: string;
  overtime_weekend_multiplier: string;
  overtime_legal_holiday_multiplier: string;
  developer_mode: boolean;
  demo_mode: boolean;
  setup_completed_at: string | Date | null;
  updated_at: string | Date | null;
};

function mapRow(row: TenantRow): TenantConfig {
  return {
    id: row.id,
    factoryShortName: row.factory_short_name,
    logoBase64: row.logo_base64,
    workSchedule: row.work_schedule,
    weatherProvider: row.weather_provider,
    weatherEncryptedKey: row.weather_encrypted_key,
    weatherLocationId: row.weather_location_id,
    weatherCity: row.weather_city,
    weatherApiHost: row.weather_api_host,
    weatherEnabled: row.weather_enabled,
    workStartTime: row.work_start_time,
    workEndTime: row.work_end_time,
    lunchStartTime: row.lunch_start_time,
    lunchEndTime: row.lunch_end_time,
    overtimeStandardHours: row.overtime_standard_hours,
    overtimeWeekdayMultiplier: row.overtime_weekday_multiplier,
    overtimeWeekdayOvertimeMultiplier: row.overtime_weekday_overtime_multiplier,
    overtimeWeekendMultiplier: row.overtime_weekend_multiplier,
    overtimeLegalHolidayMultiplier: row.overtime_legal_holiday_multiplier,
    developerMode: row.developer_mode,
    demoMode: row.demo_mode,
    setupCompletedAt: row.setup_completed_at as TenantConfig['setupCompletedAt'],
    updatedAt: row.updated_at as TenantConfig['updatedAt'],
  };
}

export async function getTenantConfig(): Promise<TenantConfig | null> {
  try {
    await ensureTenantTables();
    const result = await db.execute(sql`
      SELECT * FROM clockin.tenant_config WHERE id = 1 LIMIT 1
    `) as unknown as { rows?: TenantRow[] };
    const row = result.rows?.[0];
    return row ? mapRow(row) : null;
  } catch (error) {
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      console.warn('[tenant] failed to load tenant config', error);
    }
    return null;
  }
}

export async function ensureTenantRow(): Promise<void> {
  await ensureTenantTables();
  await db.execute(sql`
    INSERT INTO clockin.tenant_config (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);
}

type UpsertInput = Partial<{
  factoryShortName: string | null;
  logoBase64: string | null;
  workSchedule: WorkScheduleConfig | null;
  weatherProvider: string | null;
  weatherEncryptedKey: string | null;
  weatherLocationId: string | null;
  weatherCity: string | null;
  weatherApiHost: string | null;
  weatherEnabled: boolean;
  workStartTime: string | null;
  workEndTime: string | null;
  lunchStartTime: string | null;
  lunchEndTime: string | null;
  overtimeStandardHours: string;
  overtimeWeekdayMultiplier: string;
  overtimeWeekdayOvertimeMultiplier: string;
  overtimeWeekendMultiplier: string;
  overtimeLegalHolidayMultiplier: string;
  developerMode: boolean;
  demoMode: boolean;
}>;

export async function upsertTenantConfig(patch: UpsertInput): Promise<void> {
  await ensureTenantRow();
  if (Object.keys(patch).length === 0) return;
  await db.update(tenantConfigTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(tenantConfigTable.id, 1));
  invalidateTenantCache();
}

export async function markSetupCompleted(): Promise<void> {
  await ensureTenantRow();
  await db.execute(sql`
    UPDATE clockin.tenant_config
    SET setup_completed_at = NOW(), updated_at = NOW()
    WHERE id = 1
  `);
  invalidateTenantCache();
}

// ============================================================
// Convenience getters (cached light-touch reads).
// ============================================================

export async function getFactoryShortName(): Promise<string> {
  const config = await getTenantConfig();
  return config?.factoryShortName?.trim() || '工厂考勤';
}

export async function getWorkSchedule(): Promise<WorkScheduleConfig | null> {
  const config = await getTenantConfig();
  return config?.workSchedule ?? null;
}

export async function getOvertimeMultipliers(): Promise<OvertimeMultipliers> {
  const config = await getTenantConfig();
  return normalizeOvertimeMultipliers({
    standardDailyHours: config?.overtimeStandardHours,
    weekday: config?.overtimeWeekdayMultiplier,
    weekdayOvertime: config?.overtimeWeekdayOvertimeMultiplier,
    weekend: config?.overtimeWeekendMultiplier,
    legalHoliday: config?.overtimeLegalHolidayMultiplier,
  });
}

export type WorkTimes = {
  startTime: string;
  endTime: string;
  lunchStartTime: string;
  lunchEndTime: string;
};

export async function getWorkTimes(): Promise<WorkTimes> {
  const config = await getTenantConfig();
  return {
    startTime:      config?.workStartTime  ?? '08:00',
    endTime:        config?.workEndTime    ?? '17:30',
    lunchStartTime: config?.lunchStartTime ?? '12:00',
    lunchEndTime:   config?.lunchEndTime   ?? '13:00',
  };
}
