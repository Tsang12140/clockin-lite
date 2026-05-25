'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/requireAuth';
import { recordAuditLog } from '@/lib/audit';
import { upsertTenantConfig } from '@/lib/tenant';
import { normalizeOvertimeMultipliers } from '@/lib/overtime';

type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function saveSalaryRulesAction(input: {
  standardDailyHours: number | string;
  weekday: number | string;
  weekdayOvertime: number | string;
  weekend: number | string;
  legalHoliday: number | string;
}): Promise<ActionResult> {
  const session = await requireAuth();
  const multipliers = normalizeOvertimeMultipliers(input);

  await upsertTenantConfig({
    overtimeStandardHours: multipliers.standardDailyHours.toFixed(1),
    overtimeWeekdayMultiplier: multipliers.weekday.toFixed(2),
    overtimeWeekdayOvertimeMultiplier: multipliers.weekdayOvertime.toFixed(2),
    overtimeWeekendMultiplier: multipliers.weekend.toFixed(2),
    overtimeLegalHolidayMultiplier: multipliers.legalHoliday.toFixed(2),
  });
  await recordAuditLog({
    action: 'save_salary_rules',
    actionLabel: '修改薪资规则',
    pageUrl: '/settings/overtime',
    user: session,
    detail: multipliers,
  });
  revalidatePath('/salary');
  revalidatePath('/settings');
  revalidatePath('/settings/overtime');

  return { ok: true, message: '薪资规则已保存。' };
}
