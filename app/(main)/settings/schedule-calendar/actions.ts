'use server';

import { revalidatePath } from 'next/cache';
import { recordAuditLog } from '@/lib/audit';
import { saveScheduleOverride, type ScheduleOverrideType } from '@/lib/scheduleOverrides';

export type ScheduleCalendarResult =
  | { ok: true }
  | { ok: false; error: string };

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

export async function saveScheduleCalendarDay(formData: FormData): Promise<ScheduleCalendarResult> {
  const date = String(formData.get('date') ?? '').trim();
  const type = String(formData.get('type') ?? '').trim() as ScheduleOverrideType;
  if (!isValidDate(date)) return { ok: false, error: '日期不正确。' };
  if (!['factory_holiday', 'workday', 'default'].includes(type)) {
    return { ok: false, error: '排班类型不正确。' };
  }
  await saveScheduleOverride(date, type);
  await recordAuditLog({
    action: 'save_schedule_calendar',
    actionLabel: '修改排班日历',
    pageUrl: '/settings/schedule-calendar',
    detail: { date, type },
  });
  revalidatePath('/');
  revalidatePath('/salary');
  revalidatePath('/settings/schedule-calendar');
  return { ok: true };
}
