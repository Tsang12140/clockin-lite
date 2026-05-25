import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { getTenantConfig, upsertTenantConfig } from '@/lib/tenant';

let demoColumnsReady: Promise<void> | null = null;

export async function ensureDemoColumns(): Promise<void> {
  if (!demoColumnsReady) {
    demoColumnsReady = (async () => {
      await db.execute(sql`
        ALTER TABLE clockin.employees
        ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE
      `);
      await db.execute(sql`
        ALTER TABLE clockin.attendance_records
        ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE
      `);
      await db.execute(sql`
        ALTER TABLE clockin.hourly_rate_history
        ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE
      `);
      await db.execute(sql`
        ALTER TABLE clockin.holidays
        ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE
      `);
    })().catch(err => {
      demoColumnsReady = null;
      throw err;
    });
  }
  return demoColumnsReady;
}

export async function isDemoModeEnabled(): Promise<boolean> {
  try {
    await ensureDemoColumns();
    const config = await getTenantConfig();
    return config?.demoMode === true;
  } catch {
    return false;
  }
}

export async function setDemoMode(enabled: boolean): Promise<void> {
  await ensureDemoColumns();
  await upsertTenantConfig({ demoMode: enabled });
}
