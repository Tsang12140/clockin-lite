import 'server-only';

import type { TenantConfig, WorkScheduleConfig } from '@/db/schema';
import { calculateDailyWage } from '@/lib/overtime';
import { getChinaAdjustedWorkdayDatesForMonth, getChinaHolidayDatesForMonth } from '@/lib/chinaHolidays';
import { effectiveRate } from '@/lib/utils';
import { normalizeOvertimeMultipliers, type OvertimeMultipliers } from '@/lib/overtime';
import { normalizeWorkSchedule } from '@/lib/workSchedule';
import { chooseTypicalWorkedHours } from '@/lib/defaultHours';

export function isVirtualDbEnabled(): boolean {
  const mode = (process.env.CLOCKIN_DATA_MODE ?? process.env.CLOCKIN_STORAGE ?? 'virtual').trim().toLowerCase();
  return mode !== 'postgres' && mode !== 'database' && mode !== 'db';
}

type VirtualAdminUser = {
  id: number;
  phone: string;
  passwordHash: string;
  role: string;
  createdAt: Date;
  lastLoginAt: Date | null;
};

type VirtualPosition = {
  id: number;
  name: string;
  defaultHourlyRate: string | null;
  createdAt: Date | null;
};

type VirtualEmployee = {
  id: number;
  name: string;
  gender: string | null;
  phone: string | null;
  idCard: string | null;
  positionId: number | null;
  positionName: string | null;
  status: string | null;
  hireDate: string;
  leaveDate: string | null;
  currentHourlyRate: string | null;
  notes: string | null;
  isDemo: boolean;
  createdAt: Date | null;
};

type VirtualRateHistory = {
  id: number;
  employeeId: number | null;
  rate: string;
  effectiveDate: string;
  notes: string | null;
  isDemo: boolean;
  createdAt: Date | null;
};

type VirtualAttendanceRecord = {
  id: number;
  employeeId: number | null;
  workDate: string;
  hours: string | null;
  status: string | null;
  statusLabel: string | null;
  note: string | null;
  isLocked: boolean;
  isDemo: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type VirtualHoliday = {
  id: number;
  date: string;
  name: string;
  type: string | null;
  isPaid: boolean | null;
  isDemo: boolean;
  createdAt: Date | null;
};

type VirtualAIHistoryItem = {
  id: number;
  userId: string | null;
  userPhone: string | null;
  userMessage: string;
  assistantReply: string;
  mode: string;
  pageUrl: string | null;
  actions: Array<{ type: string; label: string; href: string }> | null;
  createdAt: Date;
};

type VirtualStore = {
  tenant: TenantConfig;
  adminUsers: VirtualAdminUser[];
  positions: VirtualPosition[];
  employees: VirtualEmployee[];
  rateHistory: VirtualRateHistory[];
  attendance: VirtualAttendanceRecord[];
  holidays: VirtualHoliday[];
  aliases: Record<number, string[]>;
  aiHistory: VirtualAIHistoryItem[];
  nextIds: {
    admin: number;
    position: number;
    employee: number;
    rate: number;
    attendance: number;
    holiday: number;
    aiHistory: number;
  };
};

declare global {
  // eslint-disable-next-line no-var
  var __clockinLiteVirtualStore: VirtualStore | undefined;
}

function dateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  return dateString(new Date(year, month - 1, day + days));
}

function todayString(): string {
  return dateString(new Date());
}

function buildTenant(): TenantConfig {
  const now = new Date();
  return {
    id: 1,
    factoryShortName: null,
    logoBase64: null,
    workSchedule: { type: 'single', restDays: [0] },
    weatherProvider: null,
    weatherEncryptedKey: null,
    weatherLocationId: null,
    weatherCity: null,
    weatherApiHost: null,
    weatherEnabled: false,
    workStartTime: '08:00',
    workEndTime: '17:30',
    lunchStartTime: '12:00',
    lunchEndTime: '13:00',
    salaryPayDay: 15,
    overtimeStandardHours: '8.0',
    overtimeWeekdayMultiplier: '1.00',
    overtimeWeekdayOvertimeMultiplier: '1.00',
    overtimeWeekendMultiplier: '1.00',
    overtimeLegalHolidayMultiplier: '1.00',
    developerMode: false,
    demoMode: true,
    setupCompletedAt: null,
    updatedAt: now,
  };
}

function buildPositions(): VirtualPosition[] {
  return [
    { id: 1, name: '车缝', defaultHourlyRate: '24.00', createdAt: null },
    { id: 2, name: '包装', defaultHourlyRate: '22.00', createdAt: null },
    { id: 3, name: '质检', defaultHourlyRate: '23.00', createdAt: null },
  ];
}

function buildEmployees(): VirtualEmployee[] {
  return [
    {
      id: 1,
      name: '林芳',
      gender: 'female',
      phone: null,
      idCard: null,
      positionId: 1,
      positionName: '车缝',
      status: 'active',
      hireDate: '2025-01-01',
      leaveDate: null,
      currentHourlyRate: '26.00',
      notes: null,
      isDemo: true,
      createdAt: null,
    },
    {
      id: 2,
      name: '陈秀英',
      gender: 'female',
      phone: null,
      idCard: null,
      positionId: 1,
      positionName: '车缝',
      status: 'active',
      hireDate: '2025-01-01',
      leaveDate: null,
      currentHourlyRate: '24.00',
      notes: null,
      isDemo: true,
      createdAt: null,
    },
    {
      id: 3,
      name: '李慧明',
      gender: 'female',
      phone: null,
      idCard: null,
      positionId: 2,
      positionName: '包装',
      status: 'active',
      hireDate: '2025-01-01',
      leaveDate: null,
      currentHourlyRate: '22.00',
      notes: null,
      isDemo: true,
      createdAt: null,
    },
    {
      id: 4,
      name: '苏月琴',
      gender: 'female',
      phone: null,
      idCard: null,
      positionId: 3,
      positionName: '质检',
      status: 'active',
      hireDate: '2025-01-01',
      leaveDate: null,
      currentHourlyRate: '23.00',
      notes: null,
      isDemo: true,
      createdAt: null,
    },
    {
      id: 5,
      name: '黄美珍',
      gender: 'female',
      phone: null,
      idCard: null,
      positionId: 2,
      positionName: '包装',
      status: 'inactive',
      hireDate: '2025-01-01',
      leaveDate: '2026-02-18',
      currentHourlyRate: '21.00',
      notes: '演示离职员工',
      isDemo: true,
      createdAt: null,
    },
    {
      id: 6,
      name: '赵小兰',
      gender: 'female',
      phone: null,
      idCard: null,
      positionId: 1,
      positionName: '车缝',
      status: 'inactive',
      hireDate: '2025-01-08',
      leaveDate: '2026-02-26',
      currentHourlyRate: '23.00',
      notes: '演示离职员工',
      isDemo: true,
      createdAt: null,
    },
    {
      id: 7,
      name: '吴桂香',
      gender: 'female',
      phone: null,
      idCard: null,
      positionId: 3,
      positionName: '质检',
      status: 'inactive',
      hireDate: '2025-02-01',
      leaveDate: '2026-01-20',
      currentHourlyRate: '22.50',
      notes: '演示离职员工',
      isDemo: true,
      createdAt: null,
    },
    {
      id: 8,
      name: '刘春梅',
      gender: 'female',
      phone: null,
      idCard: null,
      positionId: 1,
      positionName: '车缝',
      status: 'inactive',
      hireDate: '2025-01-15',
      leaveDate: '2025-12-28',
      currentHourlyRate: '24.00',
      notes: '演示离职员工',
      isDemo: true,
      createdAt: null,
    },
    {
      id: 9,
      name: '何玉莲',
      gender: 'female',
      phone: null,
      idCard: null,
      positionId: 2,
      positionName: '包装',
      status: 'inactive',
      hireDate: '2025-03-01',
      leaveDate: '2025-11-22',
      currentHourlyRate: '20.50',
      notes: '演示离职员工',
      isDemo: true,
      createdAt: null,
    },
    {
      id: 10,
      name: '潘志强',
      gender: 'male',
      phone: null,
      idCard: null,
      positionId: 2,
      positionName: '包装',
      status: 'inactive',
      hireDate: '2025-01-20',
      leaveDate: '2026-02-10',
      currentHourlyRate: '22.00',
      notes: '演示离职员工',
      isDemo: true,
      createdAt: null,
    },
    {
      id: 11,
      name: '郑阿敏',
      gender: 'female',
      phone: null,
      idCard: null,
      positionId: 1,
      positionName: '车缝',
      status: 'inactive',
      hireDate: '2025-04-10',
      leaveDate: '2026-01-31',
      currentHourlyRate: '23.50',
      notes: '演示离职员工',
      isDemo: true,
      createdAt: null,
    },
    {
      id: 12,
      name: '罗海燕',
      gender: 'female',
      phone: null,
      idCard: null,
      positionId: 3,
      positionName: '质检',
      status: 'inactive',
      hireDate: '2025-02-18',
      leaveDate: '2025-10-30',
      currentHourlyRate: '22.00',
      notes: '演示离职员工',
      isDemo: true,
      createdAt: null,
    },
  ];
}

function buildRateHistory(employees: VirtualEmployee[]): VirtualRateHistory[] {
  let id = 1;
  return employees.flatMap(employee => {
    const current = Number(employee.currentHourlyRate ?? 0);
    const firstRate = Math.max(18, current - 2).toFixed(2);
    const midRate = Math.max(18, current - 1).toFixed(2);
    return [
      {
        id: id++,
        employeeId: employee.id,
        rate: firstRate,
        effectiveDate: employee.hireDate,
        notes: '入职时薪',
        isDemo: true,
        createdAt: null,
      },
      {
        id: id++,
        employeeId: employee.id,
        rate: midRate,
        effectiveDate: '2025-08-01',
        notes: '演示调薪',
        isDemo: true,
        createdAt: null,
      },
      {
        id: id++,
        employeeId: employee.id,
        rate: employee.currentHourlyRate ?? firstRate,
        effectiveDate: '2026-01-01',
        notes: '演示调薪',
        isDemo: true,
        createdAt: null,
      },
    ];
  });
}

const specialDays: Record<string, Record<number, { status: string; hours?: string | null; statusLabel?: string | null }>> = {
  '2026-01-08': { 3: { status: 'leave' } },
  '2026-01-16': { 4: { status: 'sick' } },
  '2026-01-23': { 2: { status: 'custom', statusLabel: '培训' } },
  '2026-02-03': { 1: { status: 'absent' } },
  '2026-02-14': {
    1: { status: 'holiday' },
    2: { status: 'holiday' },
    3: { status: 'holiday' },
    4: { status: 'holiday' },
  },
  '2026-03-05': { 3: { status: 'custom', statusLabel: '外勤' } },
  '2026-03-27': { 2: { status: 'sick' } },
  '2026-04-04': {
    1: { status: 'holiday' },
    2: { status: 'holiday' },
    3: { status: 'holiday' },
    4: { status: 'holiday' },
  },
  '2026-04-13': { 1: { status: 'custom', statusLabel: '半天' } },
  '2026-04-21': { 3: { status: 'leave' }, 4: { status: 'absent' } },
  '2026-05-01': {
    1: { status: 'holiday' },
    2: { status: 'holiday' },
    3: { status: 'holiday' },
    4: { status: 'holiday' },
  },
  '2026-05-05': { 2: { status: 'leave' } },
  '2026-05-07': { 3: { status: 'custom', statusLabel: '调岗' } },
  '2026-05-09': { 4: { status: 'sick' } },
};

function workedHours(day: string, employeeIndex: number): string {
  const [, month, date] = day.split('-').map(Number);
  const bases = [8, 8.5, 8, 8, 7.5, 8, 8.5, 8, 7.5, 8, 8, 8.5];
  const shifts = [0, 0.5, 0, 0, -0.5, 1, 0, 0.5];
  const base = bases[employeeIndex % bases.length];
  const shift = shifts[(month + date + employeeIndex) % shifts.length];
  const value = Math.max(4, Math.min(10, base + shift));
  return value.toFixed(1);
}

function buildAttendance(employees: VirtualEmployee[]): VirtualAttendanceRecord[] {
  const start = '2025-01-01';
  const today = todayString();
  const end = today < start ? '2026-05-25' : today;
  const rows: VirtualAttendanceRecord[] = [];
  let id = 1;

  for (let day = start; day <= end; day = addDays(day, 1)) {
    const [year, month, date] = day.split('-').map(Number);
    const dayOfWeek = new Date(year, month - 1, date).getDay();
    for (const [index, employee] of employees.entries()) {
      if (day < employee.hireDate) continue;
      if (employee.leaveDate && day > employee.leaveDate) continue;
      const sparseFormerEmployee = employee.status === 'inactive' && ((date + employee.id + month) % 4 === 0);
      if (sparseFormerEmployee && dayOfWeek !== 0) continue;
      const special = specialDays[day]?.[employee.id];
      const status = special?.status ?? (dayOfWeek === 0 ? 'holiday' : 'worked');
      rows.push({
        id: id++,
        employeeId: employee.id,
        workDate: day,
        hours: status === 'worked' ? (special?.hours ?? workedHours(day, index)) : null,
        status,
        statusLabel: special?.statusLabel ?? null,
        note: null,
        isLocked: true,
        isDemo: true,
        createdAt: null,
        updatedAt: null,
      });
    }
  }

  return rows;
}

function createStore(): VirtualStore {
  const positions = buildPositions();
  const employees = buildEmployees();
  const rateHistory = buildRateHistory(employees);
  const attendance = buildAttendance(employees);
  return {
    tenant: buildTenant(),
    adminUsers: [],
    positions,
    employees,
    rateHistory,
    attendance,
    holidays: [],
    aliases: {
      1: ['阿芳', '芳姐'],
      2: ['秀英'],
      3: ['慧明'],
      4: ['月琴'],
      5: ['美珍'],
      6: ['小兰'],
      7: ['桂香'],
      8: ['春梅'],
      9: ['玉莲'],
      10: ['强哥'],
      11: ['阿敏'],
      12: ['海燕'],
    },
    aiHistory: [],
    nextIds: {
      admin: 1,
      position: Math.max(...positions.map(item => item.id)) + 1,
      employee: Math.max(...employees.map(item => item.id)) + 1,
      rate: Math.max(...rateHistory.map(item => item.id)) + 1,
      attendance: Math.max(...attendance.map(item => item.id)) + 1,
      holiday: 1,
      aiHistory: 1,
    },
  };
}

function getStore(): VirtualStore {
  globalThis.__clockinLiteVirtualStore ??= createStore();
  return globalThis.__clockinLiteVirtualStore;
}

export function isVirtualSetupCompleted(): boolean {
  return getStore().tenant.setupCompletedAt != null && getStore().adminUsers.length > 0;
}

export function createVirtualAdminUser(phone: string, passwordHash: string) {
  const store = getStore();
  const existing = store.adminUsers.find(user => user.phone === phone);
  if (existing) return null;
  const user: VirtualAdminUser = {
    id: store.nextIds.admin++,
    phone,
    passwordHash,
    role: 'admin',
    createdAt: new Date(),
    lastLoginAt: null,
  };
  store.adminUsers.push(user);
  return { id: user.id, phone: user.phone, role: user.role };
}

export function getVirtualAdminUser(phone: string) {
  const user = getStore().adminUsers.find(item => item.phone === phone);
  return user ? { ...user } : null;
}

export function getVirtualInviteAdminUser(phone?: string) {
  const store = getStore();
  const user = phone
    ? store.adminUsers.find(item => item.phone === phone)
    : store.adminUsers[0];
  return user ? { ...user } : null;
}

export function markVirtualAdminLogin(userId: number): void {
  const user = getStore().adminUsers.find(item => item.id === userId);
  if (user) user.lastLoginAt = new Date();
}

export function getVirtualTenantConfig(): TenantConfig {
  return { ...getStore().tenant };
}

export function patchVirtualTenantConfig(patch: Partial<TenantConfig>): void {
  const store = getStore();
  store.tenant = {
    ...store.tenant,
    ...patch,
    updatedAt: new Date(),
  };
}

export function markVirtualSetupCompleted(): void {
  patchVirtualTenantConfig({ setupCompletedAt: new Date() });
}

export function getVirtualOvertimeMultipliers(): OvertimeMultipliers {
  const config = getStore().tenant;
  return normalizeOvertimeMultipliers({
    standardDailyHours: config.overtimeStandardHours,
    weekday: config.overtimeWeekdayMultiplier,
    weekdayOvertime: config.overtimeWeekdayOvertimeMultiplier,
    weekend: config.overtimeWeekendMultiplier,
    legalHoliday: config.overtimeLegalHolidayMultiplier,
  });
}

export function getVirtualWorkSchedule(): WorkScheduleConfig | null {
  return getStore().tenant.workSchedule ?? null;
}

function activeFilter(employee: VirtualEmployee): boolean {
  return employee.status === 'active';
}

function employeeForList(employee: VirtualEmployee) {
  return {
    id: employee.id,
    name: employee.name,
    gender: employee.gender,
    phone: employee.phone,
    status: employee.status,
    currentHourlyRate: employee.currentHourlyRate,
    positionId: employee.positionId,
    positionName: employee.positionName,
    hireDate: employee.hireDate,
    leaveDate: employee.leaveDate,
    notes: employee.notes,
  };
}

export function getVirtualActiveEmployees() {
  return getStore().employees
    .filter(activeFilter)
    .sort((a, b) => a.id - b.id)
    .map(employee => ({
      id: employee.id,
      name: employee.name,
      gender: employee.gender,
      status: employee.status,
      currentHourlyRate: employee.currentHourlyRate,
      positionName: employee.positionName,
      hireDate: employee.hireDate,
      aliases: getVirtualAliasesForEmployee(employee.id),
    }));
}

export function getVirtualAllEmployees() {
  return getStore().employees
    .slice()
    .sort((a, b) => String(a.status).localeCompare(String(b.status)) || a.id - b.id)
    .map(employeeForList);
}

export function getVirtualEmployeeDetailData(employeeId: number) {
  const employee = getStore().employees.find(item => item.id === employeeId);
  if (!employee) return { emp: null, rateHistory: [], aliases: [] };
  const rateHistory = getVirtualRateHistory([employeeId]).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return {
    emp: {
      ...employeeForList(employee),
      idCard: employee.idCard,
    },
    rateHistory,
    aliases: getVirtualAliasesForEmployee(employeeId),
  };
}

export function getVirtualAttendanceForRange(startDate: string, endDate: string) {
  return getStore().attendance
    .filter(item => item.workDate >= startDate && item.workDate <= endDate)
    .sort((a, b) => a.workDate.localeCompare(b.workDate) || (a.employeeId ?? 0) - (b.employeeId ?? 0))
    .map(item => ({ ...item }));
}

export function getVirtualAttendanceForDate(date: string) {
  return getVirtualAttendanceForRange(date, date);
}

export function getVirtualRateHistory(employeeIds?: number[]) {
  const allowed = employeeIds?.length ? new Set(employeeIds) : null;
  return getStore().rateHistory
    .filter(item => !allowed || (item.employeeId != null && allowed.has(item.employeeId)))
    .sort((a, b) => (a.employeeId ?? 0) - (b.employeeId ?? 0) || a.effectiveDate.localeCompare(b.effectiveDate))
    .map(item => ({ ...item }));
}

export function getVirtualLastWorkedHours(): Record<number, string> {
  const today = todayString();
  const startDate = addDays(today, -30);
  const records = getStore().attendance
    .filter(item => item.status === 'worked' && item.hours)
    .filter(item => item.workDate >= startDate && item.workDate <= today);
  return chooseTypicalWorkedHours(records);
}

export function getVirtualMonthHolidayDates(year: number, month: number): Set<string> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return new Set([
    ...getChinaHolidayDatesForMonth(year, month),
    ...getStore().holidays
      .filter(item => item.date >= start && item.date <= end)
      .map(item => item.date),
  ]);
}

export function getVirtualMonthAdjustedWorkdayDates(year: number, month: number): Set<string> {
  return getChinaAdjustedWorkdayDatesForMonth(year, month);
}

export function getVirtualMonthlySalary(year: number, month: number) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const records = getVirtualAttendanceForRange(startDate, endDate);
  const employees = getVirtualAllEmployees();
  const rateHistory = getVirtualRateHistory(employees.map(employee => employee.id));
  const workSchedule = normalizeWorkSchedule(getVirtualWorkSchedule());
  const legalHolidayDates = getVirtualMonthHolidayDates(year, month);
  const adjustedWorkdayDates = getVirtualMonthAdjustedWorkdayDates(year, month);
  const multipliers = getVirtualOvertimeMultipliers();

  const byEmployee: Record<number, typeof records> = {};
  for (const record of records) {
    if (!record.employeeId) continue;
    (byEmployee[record.employeeId] ??= []).push(record);
  }

  return employees.map(employee => {
    const employeeRecords = byEmployee[employee.id] ?? [];
    const employeeHistory = rateHistory
      .filter(item => item.employeeId === employee.id && item.effectiveDate && item.rate)
      .map(item => ({ effectiveDate: item.effectiveDate, rate: item.rate }));
    const currentRate = Number(employee.currentHourlyRate ?? 0);
    let totalHours = 0;
    let totalWage = 0;

    for (const record of employeeRecords) {
      if (record.status !== 'worked') continue;
      const hours = record.hours ? Number(record.hours) : 0;
      if (hours <= 0) continue;
      const rate = effectiveRate(employeeHistory, record.workDate) ?? currentRate;
      const wage = calculateDailyWage({
        date: record.workDate,
        hours,
        rate,
        workSchedule,
        legalHolidayDates,
        adjustedWorkdayDates,
        multipliers,
      });
      totalHours += hours;
      totalWage += wage.totalWage;
    }

    return {
      ...employee,
      totalHours,
      totalWage: Math.round(totalWage * 100) / 100,
      recordCount: employeeRecords.length,
    };
  });
}

export function getVirtualPayslipData(employeeId: number, year: number, month: number) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const employee = getStore().employees.find(item => item.id === employeeId);
  return {
    emp: employee ? {
      id: employee.id,
      name: employee.name,
      currentHourlyRate: employee.currentHourlyRate,
    } : null,
    records: getVirtualAttendanceForRange(startDate, endDate)
      .filter(item => item.employeeId === employeeId)
      .map(item => ({
        workDate: item.workDate,
        hours: item.hours,
        status: item.status,
        statusLabel: item.statusLabel,
      })),
    rateHistory: getVirtualRateHistory([employeeId])
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
      .map(item => ({ effectiveDate: item.effectiveDate, rate: item.rate })),
    allEmps: getStore().employees
      .filter(activeFilter)
      .map(item => ({ id: item.id, name: item.name })),
    workSchedule: normalizeWorkSchedule(getVirtualWorkSchedule()),
    legalHolidayDates: [...getVirtualMonthHolidayDates(year, month)],
    adjustedWorkdayDates: [...getVirtualMonthAdjustedWorkdayDates(year, month)],
    overtimeMultipliers: getVirtualOvertimeMultipliers(),
  };
}

export function saveVirtualAttendance(entries: Array<{
  employeeId: number;
  workDate: string;
  hours: number | null;
  status: string;
  statusLabel: string | null;
}>): void {
  const store = getStore();
  for (const entry of entries) {
    const existing = store.attendance.find(item => item.employeeId === entry.employeeId && item.workDate === entry.workDate);
    if (existing) {
      existing.hours = entry.hours == null ? null : String(entry.hours);
      existing.status = entry.status;
      existing.statusLabel = entry.statusLabel;
      existing.isLocked = true;
      existing.updatedAt = new Date();
      continue;
    }
    store.attendance.push({
      id: store.nextIds.attendance++,
      employeeId: entry.employeeId,
      workDate: entry.workDate,
      hours: entry.hours == null ? null : String(entry.hours),
      status: entry.status,
      statusLabel: entry.statusLabel,
      note: null,
      isLocked: true,
      isDemo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

export function unlockVirtualAttendanceDay(workDate: string): void {
  for (const record of getStore().attendance) {
    if (record.workDate === workDate) record.isLocked = false;
  }
}

export function clearVirtualAttendanceDay(workDate: string): void {
  const store = getStore();
  store.attendance = store.attendance.filter(item => item.workDate !== workDate);
}

function resolveVirtualPositionId(positionName: string): number | null {
  const name = positionName.trim();
  if (!name) return null;
  const store = getStore();
  const existing = store.positions.find(item => item.name === name);
  if (existing) return existing.id;
  const position: VirtualPosition = {
    id: store.nextIds.position++,
    name,
    defaultHourlyRate: null,
    createdAt: new Date(),
  };
  store.positions.push(position);
  return position.id;
}

function positionNameById(positionId: number | null): string | null {
  if (!positionId) return null;
  return getStore().positions.find(item => item.id === positionId)?.name ?? null;
}

export function createVirtualEmployee(data: {
  name: string;
  gender: string;
  phone: string;
  idCard: string;
  positionName: string;
  hireDate: string;
  hourlyRate: string;
  notes: string;
}): number {
  const store = getStore();
  const positionId = resolveVirtualPositionId(data.positionName);
  const employee: VirtualEmployee = {
    id: store.nextIds.employee++,
    name: data.name.trim(),
    gender: data.gender,
    phone: data.phone || null,
    idCard: data.idCard || null,
    positionId,
    positionName: positionNameById(positionId),
    status: 'active',
    hireDate: data.hireDate,
    leaveDate: null,
    currentHourlyRate: data.hourlyRate,
    notes: data.notes || null,
    isDemo: true,
    createdAt: new Date(),
  };
  store.employees.push(employee);
  if (data.hourlyRate) {
    store.rateHistory.push({
      id: store.nextIds.rate++,
      employeeId: employee.id,
      rate: data.hourlyRate,
      effectiveDate: data.hireDate,
      notes: '初始时薪',
      isDemo: true,
      createdAt: new Date(),
    });
  }
  return employee.id;
}

export function updateVirtualEmployee(employeeId: number, data: {
  name: string;
  gender: string;
  phone: string;
  idCard: string;
  positionName: string;
  hireDate: string;
  leaveDate: string;
  notes: string;
}): boolean {
  const employee = getStore().employees.find(item => item.id === employeeId);
  if (!employee) return false;
  const positionId = resolveVirtualPositionId(data.positionName);
  employee.name = data.name;
  employee.gender = data.gender;
  employee.phone = data.phone || null;
  employee.idCard = data.idCard || null;
  employee.positionId = positionId;
  employee.positionName = positionNameById(positionId);
  employee.hireDate = data.hireDate || employee.hireDate;
  employee.leaveDate = data.leaveDate || null;
  employee.notes = data.notes || null;
  return true;
}

export function addVirtualRateHistory(employeeId: number, data: { rate: string; effectiveDate: string; notes: string }): void {
  const store = getStore();
  store.rateHistory.push({
    id: store.nextIds.rate++,
    employeeId,
    rate: data.rate,
    effectiveDate: data.effectiveDate,
    notes: data.notes || null,
    isDemo: true,
    createdAt: new Date(),
  });
  const latest = getVirtualRateHistory([employeeId])
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
  const employee = store.employees.find(item => item.id === employeeId);
  if (employee && latest) employee.currentHourlyRate = latest.rate;
}

export function markVirtualEmployeeInactive(employeeId: number, leaveDate: string): boolean {
  const employee = getStore().employees.find(item => item.id === employeeId);
  if (!employee) return false;
  employee.status = 'inactive';
  employee.leaveDate = leaveDate;
  return true;
}

export function getVirtualAliasesForEmployee(employeeId: number): string[] {
  return [...(getStore().aliases[employeeId] ?? [])];
}

export function getVirtualEmployeeAliasMap(employeeIds?: number[]): Record<number, string[]> {
  const allowed = employeeIds?.length ? new Set(employeeIds) : null;
  return Object.fromEntries(
    Object.entries(getStore().aliases)
      .map(([id, aliases]) => [Number(id), aliases] as const)
      .filter(([id]) => !allowed || allowed.has(id))
      .map(([id, aliases]) => [id, [...aliases]]),
  );
}

export function replaceVirtualEmployeeAliases(employeeId: number, aliases: string[]): string[] {
  const cleaned = [...new Set(aliases.map(item => item.trim()).filter(Boolean))].slice(0, 30);
  getStore().aliases[employeeId] = cleaned;
  return cleaned;
}

export function saveVirtualAIChatLog(input: {
  userId?: string | null;
  userPhone?: string | null;
  userMessage: string;
  assistantReply: string;
  mode: 'ai' | 'rules';
  pageUrl?: string | null;
  actions?: Array<{ type: string; label: string; href: string }>;
}): void {
  const store = getStore();
  store.aiHistory.unshift({
    id: store.nextIds.aiHistory++,
    userId: input.userId || null,
    userPhone: input.userPhone || null,
    userMessage: input.userMessage.slice(0, 2000),
    assistantReply: input.assistantReply.slice(0, 4000),
    mode: input.mode,
    pageUrl: input.pageUrl?.slice(0, 500) || null,
    actions: input.actions ?? [],
    createdAt: new Date(),
  });
  store.aiHistory = store.aiHistory.slice(0, 100);
}

export function getVirtualAIChatHistory(userId?: string | null, limit = 30) {
  return getStore().aiHistory
    .filter(item => !userId || item.userId === userId)
    .slice(0, limit)
    .map(item => ({
      id: item.id,
      userId: item.userId,
      userPhone: item.userPhone,
      userMessage: item.userMessage,
      assistantReply: item.assistantReply,
      mode: item.mode,
      pageUrl: item.pageUrl,
      actions: item.actions ?? [],
      createdAt: item.createdAt.toISOString(),
    }));
}

export function virtualSummaryMonths(): Array<{ year: number; month: number }> {
  const seen = new Set<string>();
  for (const record of getStore().attendance) {
    seen.add(record.workDate.slice(0, 7));
  }
  return [...seen]
    .sort()
    .map(item => {
      const [year, month] = item.split('-').map(Number);
      return { year, month };
    });
}

export function virtualBackupSql(): string {
  const store = getStore();
  return [
    '-- Clockin Lite virtual backup',
    '-- This file was generated from in-memory demo storage.',
    `-- Generated at: ${new Date().toISOString()}`,
    '',
    `-- tenant: ${JSON.stringify(store.tenant)}`,
    `-- employees: ${JSON.stringify(store.employees)}`,
    `-- rate_history: ${JSON.stringify(store.rateHistory)}`,
    `-- attendance_records: ${JSON.stringify(store.attendance)}`,
    '',
  ].join('\n');
}
