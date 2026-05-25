'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/requireAuth';
import { recordAuditLog } from '@/lib/audit';
import { upsertTenantConfig } from '@/lib/tenant';

type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function isValidTime(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

export async function saveWorkTimesAction(input: {
  startTime: string;
  endTime: string;
  lunchStartTime: string;
  lunchEndTime: string;
}): Promise<ActionResult> {
  const session = await requireAuth();
  const startTime = input.startTime.trim();
  const endTime = input.endTime.trim();
  const lunchStartTime = input.lunchStartTime.trim();
  const lunchEndTime = input.lunchEndTime.trim();

  if (!isValidTime(startTime)) return { ok: false, error: '上班时间格式无效。' };
  if (!isValidTime(endTime)) return { ok: false, error: '下班时间格式无效。' };
  if (lunchStartTime && !isValidTime(lunchStartTime)) return { ok: false, error: '午休开始时间格式无效。' };
  if (lunchEndTime && !isValidTime(lunchEndTime)) return { ok: false, error: '午休结束时间格式无效。' };

  await upsertTenantConfig({
    workStartTime: startTime,
    workEndTime: endTime,
    lunchStartTime: lunchStartTime || null,
    lunchEndTime: lunchEndTime || null,
  });
  await recordAuditLog({
    action: 'save_work_times',
    actionLabel: '修改工作时间',
    pageUrl: '/settings/work-time',
    user: session,
    detail: { startTime, endTime, lunchStartTime, lunchEndTime },
  });
  revalidatePath('/');
  revalidatePath('/settings');
  revalidatePath('/settings/work-time');

  return { ok: true, message: '工作时间已保存。' };
}
