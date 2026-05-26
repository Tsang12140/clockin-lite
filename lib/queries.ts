import { db, employees, attendanceRecords, hourlyRateHistory, positions, holidays } from '@/db';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { getAliasesForEmployee, getEmployeeAliasMap } from '@/lib/employeeAliases';
import { isDemoModeEnabled } from '@/lib/demoMode';
import { getOvertimeMultipliers, getWorkSchedule } from '@/lib/tenant';
import { getChinaAdjustedWorkdayDatesForMonth, getChinaHolidayDatesForMonth } from '@/lib/chinaHolidays';
import { calculateDailyWage } from '@/lib/overtime';
import { normalizeWorkSchedule } from '@/lib/workSchedule';
import { effectiveRate } from '@/lib/utils';
import {
  getVirtualActiveEmployees,
  getVirtualAllEmployees,
  getVirtualAttendanceForDate,
  getVirtualAttendanceForRange,
  getVirtualEmployeeDetailData,
  getVirtualLastWorkedHours,
  getVirtualMonthAdjustedWorkdayDates,
  getVirtualMonthHolidayDates,
  getVirtualMonthlySalary,
  getVirtualPayslipData,
  getVirtualRateHistory,
  isVirtualDbEnabled,
} from '@/lib/virtualDb';

const devEmployees = [
  {
    id: 5, name: '曾金娣', gender: 'female', phone: null, status: 'active',
    currentHourlyRate: '25.50', positionId: 1, positionName: '组长',
    hireDate: '2023-04-01', leaveDate: null, notes: null,
  },
  {
    id: 8, name: '谢明清', gender: 'female', phone: null, status: 'active',
    currentHourlyRate: '19.00', positionId: 2, positionName: '工人',
    hireDate: '2024-07-01', leaveDate: null, notes: null,
  },
  {
    id: 10, name: '陈继容', gender: 'female', phone: null, status: 'active',
    currentHourlyRate: '18.00', positionId: 2, positionName: '工人',
    hireDate: '2023-04-01', leaveDate: null, notes: null,
  },
  {
    id: 11, name: '黎彩群', gender: 'female', phone: null, status: 'active',
    currentHourlyRate: '18.00', positionId: 2, positionName: '工人',
    hireDate: '2023-04-01', leaveDate: null, notes: null,
  },
];

const localPreviewEmployeeNames: Record<number, string> = {
  5: '林一鸣',
  8: '何二朗',
  10: '苏强',
  11: '周良清',
};

const localPreviewHourlyRates: Record<number, string> = {
  5: '28.00',
  8: '22.00',
  10: '23.00',
  11: '24.00',
};

function withLocalPreviewEmployee<T extends { id: number; name?: string | null }>(employee: T): T {
  if (process.env.NODE_ENV !== 'development') return employee;
  const name = localPreviewEmployeeNames[employee.id];
  const next = (name ? { ...employee, name } : { ...employee }) as T & {
    phone?: string | null;
    idCard?: string | null;
    currentHourlyRate?: string | null;
  };
  if (localPreviewHourlyRates[employee.id] && 'currentHourlyRate' in next) {
    next.currentHourlyRate = localPreviewHourlyRates[employee.id];
  }
  if ('phone' in next) next.phone = null;
  if ('idCard' in next) next.idCard = null;
  return next;
}

function withLocalPreviewNames<T extends { id: number; name?: string | null }>(list: T[]): T[] {
  return process.env.NODE_ENV === 'development' ? list.map(withLocalPreviewEmployee) : list;
}

function withLocalPreviewRateHistory<T extends { employeeId: number | null; rate?: string | null }>(list: T[]): T[] {
  if (process.env.NODE_ENV !== 'development') return list;
  return list.map(item => {
    const employeeId = item.employeeId ?? 0;
    const rate = localPreviewHourlyRates[employeeId];
    return rate ? { ...item, rate } : item;
  });
}

const devRateHistory = [
  { id: 1, employeeId: 5, rate: '23.50', effectiveDate: '2023-04-01', notes: null, createdAt: null },
  { id: 2, employeeId: 5, rate: '24.50', effectiveDate: '2025-02-01', notes: null, createdAt: null },
  { id: 3, employeeId: 5, rate: '25.50', effectiveDate: '2026-03-01', notes: null, createdAt: null },
  { id: 4, employeeId: 8, rate: '17.00', effectiveDate: '2024-07-01', notes: null, createdAt: null },
  { id: 5, employeeId: 8, rate: '18.00', effectiveDate: '2025-02-01', notes: null, createdAt: null },
  { id: 6, employeeId: 8, rate: '19.00', effectiveDate: '2026-03-01', notes: null, createdAt: null },
  { id: 7, employeeId: 10, rate: '16.00', effectiveDate: '2023-04-01', notes: null, createdAt: null },
  { id: 8, employeeId: 10, rate: '17.00', effectiveDate: '2025-02-01', notes: null, createdAt: null },
  { id: 9, employeeId: 10, rate: '18.00', effectiveDate: '2026-03-01', notes: null, createdAt: null },
  { id: 10, employeeId: 11, rate: '16.00', effectiveDate: '2023-04-01', notes: null, createdAt: null },
  { id: 11, employeeId: 11, rate: '17.00', effectiveDate: '2025-02-01', notes: null, createdAt: null },
  { id: 12, employeeId: 11, rate: '18.00', effectiveDate: '2026-03-01', notes: null, createdAt: null },
];

function canUseDevFallback(e: unknown) {
  if (process.env.NODE_ENV !== 'development') return false;
  console.warn('[clockin] database unavailable; using local preview data', e);
  return true;
}

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDevDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  return dateStr(new Date(y, m - 1, d + days));
}

const devMissingDay = '2026-03-18';

const devSpecialDays: Record<string, Record<number, { status: string; hours?: string | null; statusLabel?: string | null }>> = {
  '2026-01-08': { 10: { status: 'leave' } },
  '2026-01-16': { 11: { status: 'sick' } },
  '2026-01-23': { 8: { status: 'custom', statusLabel: '培训' } },
  '2026-02-03': { 5: { status: 'absent' } },
  '2026-02-14': {
    5: { status: 'holiday' },
    8: { status: 'holiday' },
    10: { status: 'holiday' },
    11: { status: 'holiday' },
  },
  '2026-02-24': { 11: { status: 'leave' } },
  '2026-03-05': { 10: { status: 'custom', statusLabel: '外勤' } },
  '2026-03-27': { 8: { status: 'sick' } },
  '2026-04-04': {
    5: { status: 'holiday' },
    8: { status: 'holiday' },
    10: { status: 'holiday' },
    11: { status: 'holiday' },
  },
  '2026-04-13': { 5: { status: 'custom', statusLabel: '半天' } },
  '2026-04-21': { 10: { status: 'leave' }, 11: { status: 'absent' } },
  '2026-05-01': {
    5: { status: 'holiday' },
    8: { status: 'holiday' },
    10: { status: 'holiday' },
    11: { status: 'holiday' },
  },
  '2026-05-05': { 8: { status: 'leave' } },
  '2026-05-07': { 10: { status: 'custom', statusLabel: '调岗' } },
  '2026-05-09': { 11: { status: 'sick' } },
};

function devWorkedHours(day: string, index: number) {
  const [, month, date] = day.split('-').map(Number);
  const variants = [
    ['9.0', '8.5', '8.0', '7.5'],
    ['8.5', '9.0', '8.0', '8.0'],
    ['10.0', '9.0', '8.5', '8.0'],
    ['7.5', '8.0', '7.0', '6.5'],
    ['9.5', '8.5', '8.0', '8.0'],
  ];
  return variants[(month + date) % variants.length][index];
}

function buildDevMonthRecords(year: number, month: number) {
  const lastDay = new Date(year, month, 0).getDate();
  const records = [];
  let id = year * 100000 + month * 1000;

  for (let dayNum = 1; dayNum <= lastDay; dayNum++) {
    const day = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    if (day === devMissingDay) continue;

    const dow = new Date(year, month - 1, dayNum).getDay();
    for (const [index, emp] of devEmployees.entries()) {
      const special = devSpecialDays[day]?.[emp.id];
      const status = special?.status ?? (dow === 0 ? 'holiday' : 'worked');
      records.push({
        id: id++,
        employeeId: emp.id,
        workDate: day,
        hours: status === 'worked' ? (special?.hours ?? devWorkedHours(day, index)) : null,
        status,
        statusLabel: special?.statusLabel ?? null,
        note: null,
        isLocked: true,
        isDemo: false,
        createdAt: null,
        updatedAt: null,
      });
    }
  }

  return records;
}

function devAttendanceRecords(startDate: string, endDate: string) {
  const now = new Date();
  const today = dateStr(now);
  const dow = now.getDay();
  const monday = addDevDays(today, dow === 0 ? -6 : 1 - dow);
  const previewYear = 2026;
  const previewEndMonth = now.getFullYear() === previewYear ? now.getMonth() + 1 : 4;
  const seed = [
    ...Array.from({ length: previewEndMonth }, (_, index) => index + 1)
      .flatMap(month => buildDevMonthRecords(previewYear, month)),
    ...[
      { day: addDevDays(monday, 0), hours: ['9.0', '9.0', '8.0', '8.0'], statuses: ['worked', 'worked', 'worked', 'worked'] },
      { day: addDevDays(monday, 1), hours: ['9.5', '8.5', '8.0', '7.5'], statuses: ['worked', 'worked', 'worked', 'worked'] },
      { day: addDevDays(monday, 2), hours: ['9.0', '9.0', null, '8.0'], statuses: ['worked', 'worked', 'leave', 'worked'] },
    ].flatMap((item, itemIndex) => devEmployees.map((emp, index) => ({
      id: 900000 + itemIndex * 10 + index,
      employeeId: emp.id,
      workDate: item.day,
      hours: item.statuses[index] === 'worked' ? item.hours[index] : null,
      status: item.statuses[index],
      statusLabel: null,
      note: null,
      isLocked: true,
      isDemo: false,
      createdAt: null,
      updatedAt: null,
    }))),
  ];

  return [...new Map(
    seed
      .filter(item => item.workDate >= startDate && item.workDate <= endDate && item.workDate <= today)
      .map(item => [`${item.workDate}-${item.employeeId}`, item])
  ).values()];
}

// Active employees with position info
export async function getActiveEmployees() {
  if (isVirtualDbEnabled()) return getVirtualActiveEmployees();
  try {
    const demoMode = await isDemoModeEnabled();
    const rows = await db
      .select({
        id:               employees.id,
        name:             employees.name,
        gender:           employees.gender,
        status:           employees.status,
        currentHourlyRate: employees.currentHourlyRate,
        positionName:     positions.name,
        hireDate:         employees.hireDate,
      })
      .from(employees)
      .leftJoin(positions, eq(employees.positionId, positions.id))
      .where(and(eq(employees.status, 'active'), eq(employees.isDemo, demoMode)))
      .orderBy(employees.id);
    const aliasMap = await getEmployeeAliasMap(rows.map(row => row.id));
    return withLocalPreviewNames(rows).map(row => ({
      ...row,
      aliases: aliasMap[row.id] ?? [],
    }));
  } catch (e) {
    if (canUseDevFallback(e)) {
      const rows = withLocalPreviewNames(devEmployees.map(emp => ({
        id:                emp.id,
        name:              emp.name,
        gender:            emp.gender,
        status:            emp.status,
        currentHourlyRate: emp.currentHourlyRate,
        positionName:      emp.positionName,
        hireDate:          emp.hireDate,
      })));
      const aliasMap = await getEmployeeAliasMap(rows.map(row => row.id));
      return rows.map(row => ({ ...row, aliases: aliasMap[row.id] ?? [] }));
    }
    throw e;
  }
}

// All employees (for management page)
export async function getAllEmployees() {
  if (isVirtualDbEnabled()) return getVirtualAllEmployees();
  try {
    const demoMode = await isDemoModeEnabled();
    const rows = await db
      .select({
        id:               employees.id,
        name:             employees.name,
        gender:           employees.gender,
        phone:            employees.phone,
        status:           employees.status,
        currentHourlyRate: employees.currentHourlyRate,
        positionId:       employees.positionId,
        positionName:     positions.name,
        hireDate:         employees.hireDate,
        leaveDate:        employees.leaveDate,
        notes:            employees.notes,
      })
      .from(employees)
      .leftJoin(positions, eq(employees.positionId, positions.id))
      .where(eq(employees.isDemo, demoMode))
      .orderBy(employees.status, employees.id);
    return withLocalPreviewNames(rows);
  } catch (e) {
    if (canUseDevFallback(e)) return withLocalPreviewNames(devEmployees);
    throw e;
  }
}

export async function getEmployeeDetailData(empId: number) {
  if (isVirtualDbEnabled()) return getVirtualEmployeeDetailData(empId);
  try {
    const demoMode = await isDemoModeEnabled();
    const [emp] = await db
      .select({
        id: employees.id, name: employees.name, gender: employees.gender,
        phone: employees.phone, idCard: employees.idCard,
        positionId: employees.positionId, positionName: positions.name,
        status: employees.status, hireDate: employees.hireDate,
        leaveDate: employees.leaveDate, currentHourlyRate: employees.currentHourlyRate,
        notes: employees.notes,
      })
      .from(employees)
      .leftJoin(positions, eq(employees.positionId, positions.id))
      .where(and(eq(employees.id, empId), eq(employees.isDemo, demoMode)));

    const rateHistory = await db
      .select()
      .from(hourlyRateHistory)
      .where(and(eq(hourlyRateHistory.employeeId, empId), eq(hourlyRateHistory.isDemo, demoMode)))
      .orderBy(desc(hourlyRateHistory.effectiveDate));
    const aliases = await getAliasesForEmployee(empId);

    return { emp: emp ? withLocalPreviewEmployee(emp) : null, rateHistory: withLocalPreviewRateHistory(rateHistory), aliases };
  } catch (e) {
    if (!canUseDevFallback(e)) throw e;
    const devEmp = devEmployees.find(emp => emp.id === empId);
    if (!devEmp) return { emp: null, rateHistory: [], aliases: [] };
    return {
      emp: withLocalPreviewEmployee({
        id: devEmp.id,
        name: devEmp.name,
        gender: devEmp.gender,
        phone: devEmp.phone,
        idCard: '441900199001018888',
        positionId: devEmp.positionId,
        positionName: devEmp.positionName,
        status: devEmp.status,
        hireDate: devEmp.hireDate,
        leaveDate: devEmp.leaveDate,
        currentHourlyRate: devEmp.currentHourlyRate,
        notes: devEmp.notes,
      }),
      rateHistory: withLocalPreviewRateHistory(devRateHistory
        .filter(h => h.employeeId === empId)
        .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))),
      aliases: await getAliasesForEmployee(empId),
    };
  }
}

// Attendance for a single date (for today-entry page)
export async function getAttendanceForDate(date: string) {
  if (isVirtualDbEnabled()) return getVirtualAttendanceForDate(date);
  try {
    const demoMode = await isDemoModeEnabled();
    return await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.workDate, date), eq(attendanceRecords.isDemo, demoMode)));
  } catch (e) {
    if (canUseDevFallback(e)) return devAttendanceRecords(date, date);
    throw e;
  }
}

// Attendance for a date range
export async function getAttendanceForRange(startDate: string, endDate: string) {
  if (isVirtualDbEnabled()) return getVirtualAttendanceForRange(startDate, endDate);
  try {
    const demoMode = await isDemoModeEnabled();
    return await db
      .select()
      .from(attendanceRecords)
      .where(and(
        gte(attendanceRecords.workDate, startDate),
        lte(attendanceRecords.workDate, endDate),
        eq(attendanceRecords.isDemo, demoMode),
      ))
      .orderBy(attendanceRecords.workDate);
  } catch (e) {
    if (canUseDevFallback(e)) return devAttendanceRecords(startDate, endDate);
    throw e;
  }
}

// Rate history for employee(s)
export async function getRateHistory(employeeIds?: number[]) {
  if (isVirtualDbEnabled()) return getVirtualRateHistory(employeeIds);
  try {
    const demoMode = await isDemoModeEnabled();
    if (employeeIds?.length) {
      return withLocalPreviewRateHistory(await db.select().from(hourlyRateHistory)
        .where(and(eq(hourlyRateHistory.isDemo, demoMode), inArray(hourlyRateHistory.employeeId, employeeIds)))
        .orderBy(hourlyRateHistory.employeeId, hourlyRateHistory.effectiveDate));
    }
    return withLocalPreviewRateHistory(await db.select().from(hourlyRateHistory)
      .where(eq(hourlyRateHistory.isDemo, demoMode))
      .orderBy(hourlyRateHistory.employeeId, hourlyRateHistory.effectiveDate));
  } catch (e) {
    if (canUseDevFallback(e)) {
      const rows = employeeIds?.length
        ? devRateHistory.filter(h => h.employeeId && employeeIds.includes(h.employeeId))
        : devRateHistory;
      return withLocalPreviewRateHistory(rows);
    }
    throw e;
  }
}

// Most recent confirmed (worked) hours per employee
export async function getLastWorkedHours(): Promise<Record<number, string>> {
  if (isVirtualDbEnabled()) return getVirtualLastWorkedHours();
  try {
    const demoMode = await isDemoModeEnabled();
    const recs = await db
      .selectDistinctOn([attendanceRecords.employeeId], {
        employeeId: attendanceRecords.employeeId,
        hours:      attendanceRecords.hours,
      })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.status, 'worked'), eq(attendanceRecords.isDemo, demoMode)))
      .orderBy(attendanceRecords.employeeId, desc(attendanceRecords.workDate));

    const result: Record<number, string> = {};
    for (const r of recs) {
      if (r.employeeId && r.hours) result[r.employeeId] = r.hours;
    }
    return result;
  } catch (e) {
    if (!canUseDevFallback(e)) throw e;
    return { 5: '9.0', 8: '9.0', 10: '8.0', 11: '8.0' };
  }
}

// Monthly salary summary: total hours + computed wage per employee
export async function getMonthlySalary(year: number, month: number) {
  if (isVirtualDbEnabled()) return getVirtualMonthlySalary(year, month);
  const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

  let recs;
  try {
    const demoMode = await isDemoModeEnabled();
    recs = await db
      .select({
        employeeId:  attendanceRecords.employeeId,
        hours:       attendanceRecords.hours,
        status:      attendanceRecords.status,
        workDate:    attendanceRecords.workDate,
      })
      .from(attendanceRecords)
      .where(and(
        gte(attendanceRecords.workDate, startDate),
        lte(attendanceRecords.workDate, endDate),
        eq(attendanceRecords.isDemo, demoMode),
      ));
  } catch (e) {
    if (!canUseDevFallback(e)) throw e;
    recs = devAttendanceRecords(startDate, endDate).map(r => ({
      employeeId: r.employeeId,
      hours:      r.hours,
      status:     r.status,
      workDate:   r.workDate,
    }));
  }

  const [
    emps,
    workScheduleConfig,
    overtimeMultipliers,
    legalHolidayDates,
    adjustedWorkdayDates,
  ] = await Promise.all([
    getAllEmployees(),
    getWorkSchedule(),
    getOvertimeMultipliers(),
    getMonthHolidayDates(year, month),
    getMonthAdjustedWorkdayDates(year, month),
  ]);
  const rateHist = await getRateHistory(emps.map(e => e.id));
  const workSchedule = normalizeWorkSchedule(workScheduleConfig);

  // Group records by employee
  const byEmp: Record<number, typeof recs> = {};
  for (const r of recs) {
    if (!r.employeeId) continue;
    (byEmp[r.employeeId] ??= []).push(r);
  }

  return emps.map(emp => {
    const empRecs = byEmp[emp.id] ?? [];
    const empHistory = rateHist
      .filter(h => h.employeeId === emp.id && h.effectiveDate && h.rate)
      .map(h => ({ effectiveDate: h.effectiveDate!, rate: h.rate! }));
    const currentRate = parseFloat(String(emp.currentHourlyRate ?? 0));

    let totalHours = 0;
    let totalWage = 0;
    for (const r of empRecs) {
      if (r.status !== 'worked') continue;
      const h = r.hours ? parseFloat(String(r.hours)) : 0;
      if (h <= 0) continue;
      const rate = effectiveRate(empHistory, r.workDate!) ?? currentRate;
      const wage = calculateDailyWage({
        date: r.workDate!,
        hours: h,
        rate,
        workSchedule,
        legalHolidayDates,
        adjustedWorkdayDates,
        multipliers: overtimeMultipliers,
      });
      totalHours += h;
      totalWage += wage.totalWage;
    }

    return {
      ...emp,
      totalHours,
      totalWage: Math.round(totalWage * 100) / 100,
      recordCount: empRecs.length,
    };
  });
}

export async function getPayslipData(empId: number, year: number, month: number) {
  if (isVirtualDbEnabled()) return getVirtualPayslipData(empId, year, month);
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  try {
    const demoMode = await isDemoModeEnabled();
    const [
      empRows,
      records,
      rateHistory,
      allEmps,
      workScheduleConfig,
      legalHolidayDates,
      adjustedWorkdayDates,
      overtimeMultipliers,
    ] = await Promise.all([
      db.select({ id: employees.id, name: employees.name, currentHourlyRate: employees.currentHourlyRate })
        .from(employees).where(and(eq(employees.id, empId), eq(employees.isDemo, demoMode))),
      db.select({ workDate: attendanceRecords.workDate, hours: attendanceRecords.hours, status: attendanceRecords.status, statusLabel: attendanceRecords.statusLabel })
        .from(attendanceRecords)
        .where(and(eq(attendanceRecords.employeeId, empId), gte(attendanceRecords.workDate, startDate), lte(attendanceRecords.workDate, endDate), eq(attendanceRecords.isDemo, demoMode))),
      db.select({ effectiveDate: hourlyRateHistory.effectiveDate, rate: hourlyRateHistory.rate })
        .from(hourlyRateHistory).where(and(eq(hourlyRateHistory.employeeId, empId), eq(hourlyRateHistory.isDemo, demoMode)))
        .orderBy(hourlyRateHistory.effectiveDate),
      db.select({ id: employees.id, name: employees.name })
        .from(employees).where(and(eq(employees.status, 'active'), eq(employees.isDemo, demoMode))).orderBy(sql`${employees.id} asc`),
      getWorkSchedule(),
      getMonthHolidayDates(year, month),
      getMonthAdjustedWorkdayDates(year, month),
      getOvertimeMultipliers(),
    ]);

    return {
      emp: empRows[0] ? withLocalPreviewEmployee(empRows[0]) : null,
      records,
      rateHistory: withLocalPreviewRateHistory(rateHistory.map(item => ({ ...item, employeeId: empId }))).map(({ employeeId, ...item }) => item),
      allEmps: withLocalPreviewNames(allEmps),
      workSchedule: normalizeWorkSchedule(workScheduleConfig),
      legalHolidayDates: [...legalHolidayDates],
      adjustedWorkdayDates: [...adjustedWorkdayDates],
      overtimeMultipliers,
    };
  } catch (e) {
    if (!canUseDevFallback(e)) throw e;
    const devEmp = devEmployees.find(emp => emp.id === empId);
    if (!devEmp) {
      return {
        emp: null,
        records: [],
        rateHistory: [],
        allEmps: [],
        workSchedule: normalizeWorkSchedule(null),
        legalHolidayDates: [...getChinaHolidayDatesForMonth(year, month)],
        adjustedWorkdayDates: [...getChinaAdjustedWorkdayDatesForMonth(year, month)],
        overtimeMultipliers: await getOvertimeMultipliers(),
      };
    }
    return {
      emp: withLocalPreviewEmployee({
        id: devEmp.id,
        name: devEmp.name,
        currentHourlyRate: devEmp.currentHourlyRate,
      }),
      records: devAttendanceRecords(startDate, endDate)
        .filter(r => r.employeeId === empId)
        .map(r => ({
          workDate: r.workDate,
          hours: r.hours,
          status: r.status,
          statusLabel: r.statusLabel,
        })),
      rateHistory: withLocalPreviewRateHistory(devRateHistory
        .filter(h => h.employeeId === empId)
        .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
      ).map(h => ({ effectiveDate: h.effectiveDate, rate: h.rate })),
      allEmps: withLocalPreviewNames(devEmployees
        .filter(emp => emp.status === 'active')
        .map(emp => ({ id: emp.id, name: emp.name }))),
      workSchedule: normalizeWorkSchedule(null),
      legalHolidayDates: [...getChinaHolidayDatesForMonth(year, month)],
      adjustedWorkdayDates: [...getChinaAdjustedWorkdayDatesForMonth(year, month)],
      overtimeMultipliers: await getOvertimeMultipliers(),
    };
  }
}

// Holiday dates for a given month (returns Set of 'YYYY-MM-DD' strings)
export async function getMonthHolidayDates(year: number, month: number): Promise<Set<string>> {
  if (isVirtualDbEnabled()) return getVirtualMonthHolidayDates(year, month);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const builtInDates = getChinaHolidayDatesForMonth(year, month);
  try {
    const demoMode = await isDemoModeEnabled();
    const rows = await db
      .select({ date: holidays.date })
      .from(holidays)
      .where(and(gte(holidays.date, start), lte(holidays.date, end), eq(holidays.isDemo, demoMode)));
    return new Set([
      ...builtInDates,
      ...rows.map(r => r.date).filter((d): d is string => d !== null),
    ]);
  } catch {
    return builtInDates;
  }
}

export async function getMonthAdjustedWorkdayDates(year: number, month: number): Promise<Set<string>> {
  if (isVirtualDbEnabled()) return getVirtualMonthAdjustedWorkdayDates(year, month);
  return getChinaAdjustedWorkdayDatesForMonth(year, month);
}
