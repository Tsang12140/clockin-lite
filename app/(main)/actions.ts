'use server';

import { db, attendanceRecords } from '@/db';
import { eq, and, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getAttendanceForRange } from '@/lib/queries';
import { addDays } from '@/lib/utils';
import { requireAuth } from '@/lib/requireAuth';
import { invalidateCacheForDate } from '@/lib/ai/factsCache';
import { recordAuditLog } from '@/lib/audit';
import { isDemoModeEnabled } from '@/lib/demoMode';
import {
  clearVirtualAttendanceDay,
  isVirtualDbEnabled,
  saveVirtualAttendance,
  unlockVirtualAttendanceDay,
} from '@/lib/virtualDb';

interface AttendanceEntry {
  employeeId: number;
  workDate: string;
  hours: number | null;
  status: string;
  statusLabel: string | null;
}

export async function saveAttendance(entries: AttendanceEntry[]) {
  const session = await requireAuth();
  try {
    if (isVirtualDbEnabled()) {
      saveVirtualAttendance(entries);
      const uniqueDates = [...new Set(entries.map(e => e.workDate))];
      await Promise.all(uniqueDates.map(d => invalidateCacheForDate(d)));
      await recordAuditLog({
        action: 'save_attendance',
        actionLabel: `登记工时：${uniqueDates.join('、')}`,
        pageUrl: '/',
        user: session,
        detail: {
          dates: uniqueDates,
          entryCount: entries.length,
          statuses: entries.map(e => ({ employeeId: e.employeeId, status: e.status, hours: e.hours })),
        },
      });
      revalidatePath('/');
      return { ok: true };
    }

    const demoMode = await isDemoModeEnabled();
    for (const entry of entries) {
      await db
        .insert(attendanceRecords)
        .values({
          employeeId:  entry.employeeId,
          workDate:    entry.workDate,
          hours:       entry.hours !== null ? String(entry.hours) : null,
          status:      entry.status,
          statusLabel: entry.statusLabel,
          isLocked:    true,
          isDemo:      demoMode,
          updatedAt:   new Date(),
        })
        .onConflictDoUpdate({
          target: [attendanceRecords.employeeId, attendanceRecords.workDate],
          set: {
            hours:       sql`excluded.hours`,
            status:      sql`excluded.status`,
            statusLabel: sql`excluded.status_label`,
            isLocked:    true,
            isDemo:      demoMode,
            updatedAt:   new Date(),
          },
        });
    }
    const uniqueDates = [...new Set(entries.map(e => e.workDate))];
    await Promise.all(uniqueDates.map(d => invalidateCacheForDate(d)));
    await recordAuditLog({
      action: 'save_attendance',
      actionLabel: `登记工时：${uniqueDates.join('、')}`,
      pageUrl: '/',
      user: session,
      detail: {
        dates: uniqueDates,
        entryCount: entries.length,
        statuses: entries.map(e => ({ employeeId: e.employeeId, status: e.status, hours: e.hours })),
      },
    });
    revalidatePath('/');
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false };
  }
}

export async function unlockDay(workDate: string) {
  const session = await requireAuth();
  try {
    if (isVirtualDbEnabled()) {
      unlockVirtualAttendanceDay(workDate);
      await recordAuditLog({
        action: 'unlock_attendance',
        actionLabel: `修改工时：解锁 ${workDate}`,
        pageUrl: '/',
        user: session,
        detail: { workDate },
      });
      revalidatePath('/');
      return { ok: true };
    }

    const demoMode = await isDemoModeEnabled();
    await db
      .update(attendanceRecords)
      .set({ isLocked: false })
      .where(and(eq(attendanceRecords.workDate, workDate), eq(attendanceRecords.isDemo, demoMode)));
    await recordAuditLog({
      action: 'unlock_attendance',
      actionLabel: `修改工时：解锁 ${workDate}`,
      pageUrl: '/',
      user: session,
      detail: { workDate },
    });
    revalidatePath('/');
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false };
  }
}

export async function clearAttendanceDay(workDate: string) {
  const session = await requireAuth();
  try {
    if (isVirtualDbEnabled()) {
      clearVirtualAttendanceDay(workDate);
      await invalidateCacheForDate(workDate);
      await recordAuditLog({
        action: 'clear_attendance',
        actionLabel: `清空工时：${workDate}`,
        pageUrl: '/',
        user: session,
        detail: { workDate },
      });
      revalidatePath('/');
      return { ok: true };
    }

    const demoMode = await isDemoModeEnabled();
    await db
      .delete(attendanceRecords)
      .where(and(eq(attendanceRecords.workDate, workDate), eq(attendanceRecords.isDemo, demoMode)));
    await invalidateCacheForDate(workDate);
    await recordAuditLog({
      action: 'clear_attendance',
      actionLabel: `清空工时：${workDate}`,
      pageUrl: '/',
      user: session,
      detail: { workDate },
    });
    revalidatePath('/');
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false };
  }
}

export async function loadMonthData(year: number, month: number) {
  await requireAuth();
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const recs = await getAttendanceForRange(start, end);
  return recs.map(r => ({
    employeeId:  r.employeeId,
    workDate:    r.workDate,
    hours:       r.hours,
    status:      r.status,
    statusLabel: r.statusLabel,
    isLocked:    r.isLocked,
  }));
}

export async function loadWeekData(weekStart: string) {
  await requireAuth();
  const weekEnd = addDays(weekStart, 6);
  const recs = await getAttendanceForRange(weekStart, weekEnd);
  return recs.map(r => ({
    employeeId:  r.employeeId,
    workDate:    r.workDate,
    hours:       r.hours,
    status:      r.status,
    statusLabel: r.statusLabel,
    isLocked:    r.isLocked,
  }));
}
