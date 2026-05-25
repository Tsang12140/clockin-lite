import { db, employeeAliases } from '@/db';
import { eq, sql } from 'drizzle-orm';
import {
  getVirtualAliasesForEmployee,
  getVirtualEmployeeAliasMap,
  isVirtualDbEnabled,
  replaceVirtualEmployeeAliases,
} from '@/lib/virtualDb';

const localPreviewAliases: Record<number, string[]> = {
  5: ['一鸣', '林一'],
  8: ['二朗', '何二'],
  10: ['阿强', '苏强'],
  11: ['良清', '周清'],
};

let ensurePromise: Promise<void> | null = null;

export function normalizeEmployeeAliases(input: string[]) {
  const seen = new Set<string>();
  const aliases: string[] = [];

  for (const item of input) {
    const alias = item.trim().replace(/\s+/g, ' ');
    if (!alias || seen.has(alias)) continue;
    seen.add(alias);
    aliases.push(alias.slice(0, 30));
    if (aliases.length >= 30) break;
  }

  return aliases;
}

function withLocalPreviewAliases(employeeId: number, aliases: string[]) {
  if (process.env.NODE_ENV !== 'development') return aliases;
  if (aliases.length > 0) return aliases;
  return localPreviewAliases[employeeId] ?? aliases;
}

async function ensureEmployeeAliasesTable() {
  if (isVirtualDbEnabled()) return;
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clockin.employee_aliases (
          id SERIAL PRIMARY KEY,
          employee_id INTEGER NOT NULL REFERENCES clockin.employees(id) ON DELETE CASCADE,
          alias TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS employee_aliases_employee_alias_idx
        ON clockin.employee_aliases (employee_id, alias)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS employee_aliases_employee_id_idx
        ON clockin.employee_aliases (employee_id)
      `);
    })();
  }
  return ensurePromise;
}

export async function getAliasesForEmployee(employeeId: number) {
  if (isVirtualDbEnabled()) return getVirtualAliasesForEmployee(employeeId);
  try {
    await ensureEmployeeAliasesTable();
    const rows = await db
      .select({ alias: employeeAliases.alias })
      .from(employeeAliases)
      .where(eq(employeeAliases.employeeId, employeeId))
      .orderBy(employeeAliases.id);
    return withLocalPreviewAliases(employeeId, rows.map(row => row.alias));
  } catch (error) {
    console.warn('[clockin] employee aliases unavailable', error);
    return withLocalPreviewAliases(employeeId, []);
  }
}

export async function getEmployeeAliasMap(employeeIds?: number[]) {
  if (isVirtualDbEnabled()) return getVirtualEmployeeAliasMap(employeeIds);
  try {
    await ensureEmployeeAliasesTable();
    const rows = await db
      .select({ employeeId: employeeAliases.employeeId, alias: employeeAliases.alias })
      .from(employeeAliases)
      .orderBy(employeeAliases.employeeId, employeeAliases.id);
    const allowed = employeeIds ? new Set(employeeIds) : null;
    const map: Record<number, string[]> = {};
    for (const row of rows) {
      if (allowed && !allowed.has(row.employeeId)) continue;
      map[row.employeeId] = [...(map[row.employeeId] ?? []), row.alias];
    }

    if (process.env.NODE_ENV === 'development') {
      for (const [id, aliases] of Object.entries(localPreviewAliases)) {
        const employeeId = Number(id);
        if ((!allowed || allowed.has(employeeId)) && !map[employeeId]?.length) {
          map[employeeId] = aliases;
        }
      }
    }

    return map;
  } catch (error) {
    console.warn('[clockin] employee alias map unavailable', error);
    if (process.env.NODE_ENV !== 'development') return {};
    return employeeIds
      ? Object.fromEntries(employeeIds.map(id => [id, localPreviewAliases[id] ?? []]))
      : localPreviewAliases;
  }
}

export async function replaceEmployeeAliases(employeeId: number, input: string[]) {
  const aliases = normalizeEmployeeAliases(input);
  if (isVirtualDbEnabled()) return replaceVirtualEmployeeAliases(employeeId, aliases);
  await ensureEmployeeAliasesTable();
  await db.transaction(async tx => {
    await tx.delete(employeeAliases).where(eq(employeeAliases.employeeId, employeeId));
    if (aliases.length > 0) {
      await tx.insert(employeeAliases).values(
        aliases.map(alias => ({ employeeId, alias })),
      );
    }
  });
  return aliases;
}
