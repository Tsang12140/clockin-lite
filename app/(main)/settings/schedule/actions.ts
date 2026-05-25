'use server';

import { revalidatePath } from 'next/cache';
import type { WorkScheduleMode } from '@/lib/workSchedule';
import { buildWorkSchedule, todayDateString } from '@/lib/workSchedule';
import { upsertTenantConfig } from '@/lib/tenant';
import { requireAuth } from '@/lib/requireAuth';
import { recordAuditLog } from '@/lib/audit';

type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function isWorkScheduleMode(value: string): value is WorkScheduleMode {
  return value === 'single' || value === 'double' || value === 'biweekly';
}

export async function saveWorkScheduleAction(input: {
  mode: string;
  anchorDate?: string;
  anchorIsBigWeek?: boolean;
}): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isWorkScheduleMode(input.mode)) {
    return { ok: false, error: '排班模式无效。' };
  }

  const anchorDate = input.anchorDate && /^\d{4}-\d{2}-\d{2}$/.test(input.anchorDate)
    ? input.anchorDate
    : todayDateString();
  const anchorIsBigWeek = input.anchorIsBigWeek !== false;

  const workSchedule = buildWorkSchedule(input.mode, anchorDate, anchorIsBigWeek);
  await upsertTenantConfig({ workSchedule });
  await recordAuditLog({
    action: 'save_work_schedule',
    actionLabel: '修改排班设置',
    pageUrl: '/settings/schedule',
    user: session,
    detail: { mode: input.mode, anchorDate, anchorIsBigWeek, workSchedule },
  });
  revalidatePath('/');
  revalidatePath('/settings');
  revalidatePath('/settings/schedule');
  return { ok: true, message: '排班设置已保存。' };
}
