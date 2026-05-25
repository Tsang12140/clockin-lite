'use server';

import { db, employees, hourlyRateHistory, positions } from '@/db';
import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/requireAuth';
import { recordAuditLog } from '@/lib/audit';
import { replaceEmployeeAliases } from '@/lib/employeeAliases';
import { isDemoModeEnabled } from '@/lib/demoMode';

async function resolvePositionId(name: string): Promise<number | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existing = await db.select({ id: positions.id }).from(positions)
    .where(eq(positions.name, trimmed)).limit(1);
  if (existing[0]) return existing[0].id;
  const [created] = await db.insert(positions).values({ name: trimmed }).returning({ id: positions.id });
  return created?.id ?? null;
}

export async function updateEmployee(id: number, data: {
  name: string; gender: string; phone: string; idCard: string;
  positionName: string; hireDate: string; leaveDate: string; notes: string;
}) {
  const session = await requireAuth();
  try {
    const demoMode = await isDemoModeEnabled();
    const positionId = await resolvePositionId(data.positionName);
    await db.update(employees).set({
      name:       data.name,
      gender:     data.gender,
      phone:      data.phone || null,
      idCard:     data.idCard || null,
      positionId,
      hireDate:   data.hireDate || undefined,
      leaveDate:  data.leaveDate || null,
      notes:      data.notes || null,
    }).where(and(eq(employees.id, id), eq(employees.isDemo, demoMode)));
    revalidatePath(`/employees/${id}`);
    revalidatePath('/employees');
    await recordAuditLog({
      action: 'update_employee',
      actionLabel: `修改员工：${data.name}`,
      pageUrl: `/employees/${id}`,
      user: session,
      detail: { employeeId: id, name: data.name, positionName: data.positionName },
    });
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false };
  }
}

export async function addRateHistory(employeeId: number, data: {
  rate: string; effectiveDate: string; notes: string;
}) {
  const session = await requireAuth();
  try {
    const demoMode = await isDemoModeEnabled();
    await db.insert(hourlyRateHistory).values({
      employeeId,
      rate:          data.rate,
      effectiveDate: data.effectiveDate,
      notes:         data.notes || null,
      isDemo:        demoMode,
    });
    // Sync currentHourlyRate to the most recent rate in history (not necessarily the one just inserted)
    const [latest] = await db
      .select({ rate: hourlyRateHistory.rate })
      .from(hourlyRateHistory)
      .where(and(eq(hourlyRateHistory.employeeId, employeeId), eq(hourlyRateHistory.isDemo, demoMode)))
      .orderBy(desc(hourlyRateHistory.effectiveDate))
      .limit(1);
    if (latest) {
      await db.update(employees)
        .set({ currentHourlyRate: latest.rate })
        .where(and(eq(employees.id, employeeId), eq(employees.isDemo, demoMode)));
    }
    revalidatePath(`/employees/${employeeId}`);
    await recordAuditLog({
      action: 'add_rate_history',
      actionLabel: `修改工资：员工 ${employeeId}`,
      pageUrl: `/employees/${employeeId}`,
      user: session,
      detail: { employeeId, rate: data.rate, effectiveDate: data.effectiveDate },
    });
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false };
  }
}

export async function updateEmployeeAliases(employeeId: number, aliases: string[]) {
  const session = await requireAuth();
  try {
    const savedAliases = await replaceEmployeeAliases(employeeId, aliases);
    revalidatePath(`/employees/${employeeId}`);
    await recordAuditLog({
      action: 'update_employee_aliases',
      actionLabel: `修改花名：员工 ${employeeId}`,
      pageUrl: `/employees/${employeeId}`,
      user: session,
      detail: { employeeId, aliases: savedAliases },
    });
    return { ok: true, aliases: savedAliases };
  } catch (e) {
    console.error(e);
    return { ok: false, aliases: [] };
  }
}

export async function markInactive(id: number, leaveDate: string) {
  const session = await requireAuth();
  try {
    const demoMode = await isDemoModeEnabled();
    await db.update(employees)
      .set({ status: 'inactive', leaveDate })
      .where(and(eq(employees.id, id), eq(employees.isDemo, demoMode)));
    revalidatePath('/employees');
    await recordAuditLog({
      action: 'mark_employee_inactive',
      actionLabel: `员工离职：${id}`,
      pageUrl: `/employees/${id}`,
      user: session,
      detail: { employeeId: id, leaveDate },
    });
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false };
  }
}
