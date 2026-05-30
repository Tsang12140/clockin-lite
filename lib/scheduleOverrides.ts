import { db, holidays } from '@/db';
import { ensureTenantTables } from '@/lib/tenant';
import { isDemoModeEnabled } from '@/lib/demoMode';
import {
  getVirtualScheduleOverridesForMonth,
  isVirtualDbEnabled,
  saveVirtualScheduleOverride,
} from '@/lib/virtualDb';
import { and, eq, gte, lte, sql } from 'drizzle-orm';

export type ScheduleOverrideType = 'factory_holiday' | 'workday' | 'default';

export type ScheduleOverride = {
  date: string;
  name: string;
  type: 'factory_holiday' | 'workday';
};

export async function listScheduleOverridesForMonth(year: number, month: number): Promise<ScheduleOverride[]> {
  if (isVirtualDbEnabled()) return getVirtualScheduleOverridesForMonth(year, month) as ScheduleOverride[];
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  await ensureTenantTables();
  const demoMode = await isDemoModeEnabled();
  const rows = await db
    .select({ date: holidays.date, name: holidays.name, type: holidays.type })
    .from(holidays)
    .where(and(gte(holidays.date, start), lte(holidays.date, end), eq(holidays.isDemo, demoMode)));
  return rows
    .filter(row => row.type === 'factory_holiday' || row.type === 'workday')
    .map(row => ({
      date: row.date,
      name: row.name,
      type: row.type as 'factory_holiday' | 'workday',
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function saveScheduleOverride(date: string, type: ScheduleOverrideType) {
  if (isVirtualDbEnabled()) {
    saveVirtualScheduleOverride(date, type);
    return;
  }
  await ensureTenantTables();
  const demoMode = await isDemoModeEnabled();
  await db.delete(holidays).where(and(eq(holidays.date, date), eq(holidays.isDemo, demoMode)));
  if (type === 'default') return;
  await db.execute(sql`
    INSERT INTO clockin.holidays (date, name, type, is_paid, is_demo)
    VALUES (
      ${date},
      ${type === 'workday' ? '调休上班' : '厂休日'},
      ${type},
      ${type !== 'factory_holiday'},
      ${demoMode}
    )
    ON CONFLICT (date) DO UPDATE SET
      name = EXCLUDED.name,
      type = EXCLUDED.type,
      is_paid = EXCLUDED.is_paid,
      is_demo = EXCLUDED.is_demo
  `);
}
