import { getActiveEmployees, getAttendanceForRange, getMonthAdjustedWorkdayDates, getMonthHolidayDates, getMonthlySalary } from '@/lib/queries';
import { monthRange, todayString } from '@/lib/utils';
import { getAIAvailability, getAIProviderConfig, type AIProviderConfig } from '@/lib/ai/config';
import { getFactsCache, setFactsCache } from '@/lib/ai/factsCache';
import { getWorkSchedule } from '@/lib/tenant';
import type { WorkScheduleConfig } from '@/db/schema';
import { isWorkday, normalizeWorkSchedule } from '@/lib/workSchedule';

export type AssistantAction = {
  type: 'OPEN_EMPLOYEE' | 'OPEN_PAYSLIP' | 'OPEN_SALARY' | 'OPEN_AI_SETTINGS';
  label: string;
  href: string;
};

export type AssistantResponse = {
  reply: string;
  actions: AssistantAction[];
  mode: 'rules' | 'ai';
  planContext?: AssistantPlan | null;
  autoNavigate?: boolean;
};

export type AssistantHistoryItem = {
  role: 'user' | 'assistant';
  text: string;
};

class AIProviderConnectionError extends Error {
  constructor(message = 'AI provider connection failed') {
    super(message);
    this.name = 'AIProviderConnectionError';
  }
}

function isAIProviderConnectionError(error: unknown): error is AIProviderConnectionError {
  return error instanceof AIProviderConnectionError;
}

function aiSettingsAction(): AssistantAction {
  return { type: 'OPEN_AI_SETTINGS', label: '去 AI 设置', href: '/settings/ai' };
}

function aiNotConfiguredResponse(): AssistantResponse {
  return {
    reply: 'AI 助手还没有配置 API Key，所以现在不能调用模型。请先到 AI 设置里填写并验证 API Key、Base URL 和模型名。',
    actions: [aiSettingsAction()],
    mode: 'rules',
  };
}

function aiDisabledResponse(): AssistantResponse {
  return {
    reply: 'AI Key 已配置，但 AI 开关现在是关闭的；我只能走本地规则。去 AI 设置里打开开关后，就能调用模型。',
    actions: [aiSettingsAction()],
    mode: 'rules',
  };
}

function aiConnectionFailedResponse(): AssistantResponse {
  return {
    reply: 'AI 配置还没有连通成功：模型接口连接失败或被拒绝。请到 AI 设置里重新验证 API Key、Base URL 和模型名。',
    actions: [aiSettingsAction()],
    mode: 'rules',
  };
}

type EmployeeStub = {
  id: number;
  name: string;
  aliases?: string[];
  status?: string | null;
  gender?: string | null;
  currentHourlyRate?: string | null;
  positionName?: string | null;
  hireDate?: string | null;
};

type MonthTarget = {
  year: number;
  month: number;
};

type PlanIntent =
  | 'QUERY_EMPLOYEE_MONTH'
  | 'QUERY_STATUS_RANKING'
  | 'QUERY_MONTH_SUMMARY'
  | 'QUERY_RANGE_SUMMARY'
  | 'QUERY_EMPLOYEE_PROFILE'
  | 'QUERY_MISSING'
  | 'QUERY_ANOMALY'
  | 'OPEN_PAYSLIP'
  | 'OPEN_EMPLOYEE'
  | 'OPEN_SALARY'
  | 'CLARIFY';

export type AssistantPlan = {
  intent: PlanIntent;
  year?: number | null;
  month?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  employeeId?: number | null;
  employeeName?: string | null;
  employeeNames?: string[] | null;
  employeeFilter?: {
    type?: 'name' | 'surname' | 'alias' | 'name_contains' | 'profile' | 'none';
    value?: string | null;
    nameContains?: string | null;
    gender?: string | null;
    status?: string | null;
    positionName?: string | null;
    minHourlyRate?: number | null;
    maxHourlyRate?: number | null;
  } | null;
  status?: string | null;
  metrics?: string[];
  order?: 'top' | 'bottom' | null;
  confidence?: number;
  clarifyingQuestion?: string | null;
};

const EMPLOYEE_ALIASES: Record<number, string[]> = {
  5: ['曾金娣', '曾金弟', '金娣', '金姐', '阿娣'],
  8: ['谢明清', '谢铭清', '明清', '阿清'],
  10: ['陈继容', '陈继蓉', '陈洁容', '继容', '阿容'],
  11: ['黎彩群', '黎彩琴', '黎彩琼', '彩群', '阿群'],
};

const STATUS_LABELS: Record<string, string> = {
  worked: '正常',
  leave: '请假',
  holiday: '休息',
  sick: '病假',
  absent: '旷工',
  custom: '特殊',
};

function isActionableStatus(status: string | null | undefined) {
  return Boolean(status && status !== 'worked' && status !== 'holiday');
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[，。！？、,.!?？\s]/g, '');
}

function formatHours(value: number) {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function formatMoney(value: number) {
  return Math.round(value).toLocaleString('zh-CN');
}

function isCompletedMonth(target: MonthTarget, now = new Date()) {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return target.year < currentYear || (target.year === currentYear && target.month < currentMonth);
}

function wageText(target: MonthTarget) {
  return isCompletedMonth(target) ? '工资' : '预计工资';
}

function parseDateParts(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function formatHumanDate(date: string, currentYear = new Date().getFullYear(), showMonth = true) {
  const { year, month, day } = parseDateParts(date);
  const prefix = year === currentYear ? '' : `${year}年`;
  return `${prefix}${showMonth ? `${month}月` : ''}${day}号`;
}

function formatHumanDates(dates: string[], currentYear = new Date().getFullYear()) {
  const cleanDates = [...new Set(dates.filter(Boolean))].sort();
  if (cleanDates.length === 0) return '';
  const groups = new Map<string, string[]>();

  for (const date of cleanDates) {
    const { year, month, day } = parseDateParts(date);
    const key = `${year}-${month}`;
    const days = groups.get(key) ?? [];
    days.push(String(day));
    groups.set(key, days);
  }

  return [...groups.entries()].map(([key, days]) => {
    const [yearText, monthText] = key.split('-').map(Number);
    const prefix = yearText === currentYear ? '' : `${yearText}年`;
    return `${prefix}${monthText}月${days.map(day => `${day}号`).join('、')}`;
  }).join('、');
}

function parseMonthTarget(message: string, now = new Date()): MonthTarget {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const full = message.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月/);
  if (full) {
    return {
      year: Number(full[1]),
      month: Math.min(12, Math.max(1, Number(full[2]))),
    };
  }

  const monthOnly = message.match(/(\d{1,2})\s*月/);
  if (message.includes('去年') && monthOnly) {
    return { year: currentYear - 1, month: Math.min(12, Math.max(1, Number(monthOnly[1]))) };
  }
  if (message.includes('今年') && monthOnly) {
    return { year: currentYear, month: Math.min(12, Math.max(1, Number(monthOnly[1]))) };
  }
  if (monthOnly) {
    return { year: currentYear, month: Math.min(12, Math.max(1, Number(monthOnly[1]))) };
  }

  if (message.includes('上个月') || message.includes('上月')) {
    const prev = new Date(currentYear, currentMonth - 2, 1);
    return { year: prev.getFullYear(), month: prev.getMonth() + 1 };
  }

  if (message.includes('去年')) {
    return { year: currentYear - 1, month: currentMonth };
  }

  return { year: currentYear, month: currentMonth };
}

function matchEmployee(message: string, employees: EmployeeStub[]) {
  const normalized = normalizeText(message);

  for (const employee of employees) {
    const aliases = [employee.name, ...(employee.aliases ?? []), ...(EMPLOYEE_ALIASES[employee.id] ?? [])];
    if (aliases.some(alias => alias && normalized.includes(normalizeText(alias)))) {
      return employee;
    }
  }

  const surnameMatch = message.match(/姓\s*([\u4e00-\u9fa5])/);
  if (surnameMatch) {
    const surname = surnameMatch[1];
    const matched = employees.filter(employee => employee.name?.startsWith(surname));
    if (matched.length === 1) return matched[0];
  }

  return null;
}

function dateOf(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getDaysToInspect(
  year: number,
  month: number,
  workSchedule: WorkScheduleConfig,
  holidayDates: Set<string>,
  adjustedWorkdayDates: Set<string>,
) {
  const today = todayString();
  const lastDay = new Date(year, month, 0).getDate();
  const days: string[] = [];

  for (let day = 1; day <= lastDay; day++) {
    const date = dateOf(year, month, day);
    if (date >= today) break;
    if (isWorkday(date, workSchedule, holidayDates, adjustedWorkdayDates)) days.push(date);
  }

  return days;
}

async function buildMonthFacts(target: MonthTarget) {
  const { start, end } = monthRange(target.year, target.month);
  const [employees, salary, records, workScheduleConfig, holidayDates, adjustedWorkdayDates] = await Promise.all([
    getActiveEmployees(),
    getMonthlySalary(target.year, target.month),
    getAttendanceForRange(start, end),
    getWorkSchedule(),
    getMonthHolidayDates(target.year, target.month),
    getMonthAdjustedWorkdayDates(target.year, target.month),
  ]);
  const workSchedule = normalizeWorkSchedule(workScheduleConfig);

  type AttendanceRecordForFacts = (typeof records)[number];
  const recordsByDate = new Map<string, AttendanceRecordForFacts[]>();
  const recordsByEmployee = new Map<number, AttendanceRecordForFacts[]>();

  for (const record of records) {
    if (!record.workDate || !record.employeeId) continue;
    const byDate = recordsByDate.get(record.workDate) ?? [];
    byDate.push(record);
    recordsByDate.set(record.workDate, byDate);

    const byEmployee = recordsByEmployee.get(record.employeeId) ?? [];
    byEmployee.push(record);
    recordsByEmployee.set(record.employeeId, byEmployee);
  }

  const inspectDays = getDaysToInspect(target.year, target.month, workSchedule, holidayDates, adjustedWorkdayDates);
  const missingDates = inspectDays.filter(date => !recordsByDate.has(date));
  const specialRecords = records.filter(record => isActionableStatus(record.status));

  return {
    employees,
    salary,
    records,
    recordsByEmployee,
    target,
    workSchedule,
    holidayDates,
    adjustedWorkdayDates,
    missingDates,
    specialRecords,
  };
}

type MonthFacts = Awaited<ReturnType<typeof buildMonthFacts>>;

type RangeEmployeeSummary = {
  id: number;
  name: string;
  totalHours: number;
  workedDays: number;
  leaveDays: number;
  sickDays: number;
  absentDays: number;
};

type RangeFacts = {
  startDate: string;
  endDate: string;
  employees: EmployeeStub[];
  ranking: RangeEmployeeSummary[];
};

async function buildRangeFacts(startDate: string, endDate: string): Promise<RangeFacts> {
  const isPast = endDate < todayString();
  if (isPast) {
    const cached = await getFactsCache<RangeFacts>(startDate, endDate);
    if (cached) return cached;
  }

  const [employees, records] = await Promise.all([
    getActiveEmployees(),
    getAttendanceForRange(startDate, endDate),
  ]);

  type RangeAttendanceRecord = (typeof records)[number];
  const byEmployee = new Map<number, RangeAttendanceRecord[]>();
  for (const r of records) {
    if (!r.employeeId) continue;
    const arr = byEmployee.get(r.employeeId) ?? [];
    arr.push(r);
    byEmployee.set(r.employeeId, arr);
  }

  const ranking: RangeEmployeeSummary[] = employees.map(emp => {
    const recs = byEmployee.get(emp.id) ?? [];
    const totalHours = recs
      .filter(r => r.status === 'worked' && r.hours)
      .reduce((sum, r) => sum + parseFloat(String(r.hours)), 0);
    return {
      id: emp.id,
      name: emp.name!,
      totalHours: Math.round(totalHours * 10) / 10,
      workedDays: recs.filter(r => r.status === 'worked').length,
      leaveDays:  recs.filter(r => r.status === 'leave').length,
      sickDays:   recs.filter(r => r.status === 'sick').length,
      absentDays: recs.filter(r => r.status === 'absent').length,
    };
  }).sort((a, b) => b.totalHours - a.totalHours);

  const facts: RangeFacts = { startDate, endDate, employees, ranking };
  if (isPast) setFactsCache(startDate, endDate, facts).catch(() => {});
  return facts;
}

function formatRangeLabel(startDate: string, endDate: string) {
  const s = startDate.slice(0, 7).replace('-', '年') + '月';
  const e = endDate.slice(0, 7).replace('-', '年') + '月';
  return s === e ? s : `${s}至${e}`;
}

function summarizeRangeFacts(
  facts: RangeFacts,
  metrics: string[] = [],
  order: 'top' | 'bottom' = 'top',
  status?: string | null,
) {
  const { ranking } = facts;
  const label = formatRangeLabel(facts.startDate, facts.endDate);

  if (ranking.length === 0) {
    return `${label}没有可统计的考勤数据。`;
  }

  const statusFieldMap: Record<string, keyof Pick<RangeEmployeeSummary, 'sickDays' | 'leaveDays' | 'absentDays'>> = {
    sick: 'sickDays',
    leave: 'leaveDays',
    absent: 'absentDays',
  };
  const dayField = status ? statusFieldMap[status] : undefined;

  if (dayField) {
    const statusLabel = STATUS_LABELS[status!] || status!;
    const sorted = [...ranking].sort((a, b) => b[dayField] - a[dayField]);

    if (wantsListOutput(metrics)) {
      const lines = sorted
        .filter(item => item[dayField] > 0)
        .map((item, i) => `${i + 1}. ${item.name} ${item[dayField]}天`);
      if (lines.length === 0) return `${label}没有${statusLabel}记录。`;
      return `${label}${statusLabel}天数排名：\n${lines.join('\n')}`;
    }

    if (order === 'bottom') {
      const min = sorted[sorted.length - 1][dayField];
      const bottom = sorted.filter(item => item[dayField] === min);
      const names = bottom.map(item => item.name).join('、');
      return min === 0
        ? `${label}${names}没有${statusLabel}记录，${bottom.length > 1 ? '并列' : ''}最少。`
        : `${label}${statusLabel}最少的是${names}，共${min}天。`;
    }

    const max = sorted[0][dayField];
    if (max === 0) return `${label}没有${statusLabel}记录。`;
    const top = sorted.filter(item => item[dayField] === max);
    const names = top.map(item => item.name).join('、');
    const runner = sorted.find(item => item[dayField] < max);
    const runnerLine = runner ? `其次是${runner.name}，${runner[dayField]}天。` : '';
    return `${label}${statusLabel}最多的是${names}，共${max}天。${runnerLine}`;
  }

  // 默认按工时
  if (wantsListOutput(metrics)) {
    const lines = ranking.map((item, i) =>
      `${i + 1}. ${item.name} ${formatHours(item.totalHours)}小时（出勤${item.workedDays}天${item.leaveDays > 0 ? `、请假${item.leaveDays}天` : ''}${item.absentDays > 0 ? `、旷工${item.absentDays}天` : ''}）`
    );
    return `${label}工时排名：\n${lines.join('\n')}`;
  }

  if (order === 'bottom') {
    const pick = ranking[ranking.length - 1];
    const runner = ranking.length > 1 ? ranking[ranking.length - 2] : null;
    const runnerLine = runner ? `其次少的是${runner.name}，${formatHours(runner.totalHours)}小时。` : '';
    return `${label}工时最少的是${pick.name}，共${formatHours(pick.totalHours)}小时，出勤${pick.workedDays}天。${runnerLine}`;
  }

  const pick = ranking[0];
  const runner = ranking.length > 1 ? ranking[1] : null;
  const runnerLine = runner ? `其次是${runner.name}，${formatHours(runner.totalHours)}小时。` : '';
  return `${label}工时最多是${pick.name}，共${formatHours(pick.totalHours)}小时，出勤${pick.workedDays}天。${runnerLine}`;
}

function normalizeGender(value: string | null | undefined) {
  if (!value) return null;
  const normalized = normalizeText(value);
  if (['female', 'f', '女', '女人', '女性', '女员工'].some(item => normalized.includes(normalizeText(item)))) {
    return 'female';
  }
  if (['male', 'm', '男', '男人', '男性', '男员工'].some(item => normalized.includes(normalizeText(item)))) {
    return 'male';
  }
  return normalized;
}

function employeeMatchesPlanFilter(employee: EmployeeStub, filter: AssistantPlan['employeeFilter']) {
  if (!filter) return true;

  const value = filter.value?.trim();
  if (filter.type === 'surname' && value && !employee.name?.startsWith(value)) return false;
  if ((filter.type === 'name_contains' || filter.nameContains) && !(employee.name ?? '').includes(filter.nameContains || value || '')) {
    return false;
  }
  if ((filter.type === 'name' || filter.type === 'alias') && value) {
    const matched = matchEmployee(value, [employee]);
    if (!matched && !normalizeText(employee.name ?? '').includes(normalizeText(value))) return false;
  }
  if (filter.gender && normalizeGender(employee.gender) !== normalizeGender(filter.gender)) return false;
  if (filter.status && normalizeText(employee.status ?? '') !== normalizeText(filter.status)) return false;
  if (filter.positionName && !normalizeText(employee.positionName ?? '').includes(normalizeText(filter.positionName))) return false;

  const rate = employee.currentHourlyRate ? parseFloat(String(employee.currentHourlyRate)) : null;
  if (typeof filter.minHourlyRate === 'number' && (rate === null || rate < filter.minHourlyRate)) return false;
  if (typeof filter.maxHourlyRate === 'number' && (rate === null || rate > filter.maxHourlyRate)) return false;

  return true;
}

function resolveEmployeeScope(plan: AssistantPlan, employees: EmployeeStub[]) {
  if (typeof plan.employeeId === 'number') {
    const employee = employees.find(item => item.id === plan.employeeId) ?? null;
    return { scope: employee ? [employee] : [], employee };
  }

  if (Array.isArray(plan.employeeNames) && plan.employeeNames.length > 0) {
    const scope = plan.employeeNames
      .map(name => matchEmployee(name, employees))
      .filter((e): e is EmployeeStub => e !== null);
    return { scope, employee: scope.length === 1 ? scope[0] : null };
  }

  if (plan.employeeName) {
    const employee = matchEmployee(plan.employeeName, employees);
    if (employee) return { scope: [employee], employee };
  }

  const filter = plan.employeeFilter;
  if (!filter || filter.type === 'none') return { scope: employees, employee: null };

  const scope = employees.filter(employee => employeeMatchesPlanFilter(employee, filter));
  return { scope, employee: scope.length === 1 ? scope[0] : null };
}

function scopeLabel(filter: AssistantPlan['employeeFilter'], count: number) {
  if (!filter || filter.type === 'none') return '';
  const parts: string[] = [];
  const gender = normalizeGender(filter.gender);
  if (gender === 'female') parts.push('女员工');
  else if (gender === 'male') parts.push('男员工');
  if (filter.status === 'active') parts.push('在职员工');
  if (filter.positionName) parts.push(`${filter.positionName}岗位`);
  if (filter.type === 'surname' && filter.value) parts.push(`姓${filter.value}的员工`);
  if ((filter.type === 'name_contains' || filter.nameContains) && (filter.nameContains || filter.value)) {
    parts.push(`名字里有${filter.nameContains || filter.value}的员工`);
  }
  return parts.length > 0 ? parts.join('、') : `这${count}位员工`;
}

function scopeMonthFacts(facts: MonthFacts, scope: EmployeeStub[]): MonthFacts {
  const allowedIds = new Set(scope.map(employee => employee.id));
  const records = facts.records.filter(record => record.employeeId && allowedIds.has(record.employeeId));
  const salary = facts.salary.filter(item => allowedIds.has(item.id));

  const recordsByDate = new Map<string, typeof records>();
  const recordsByEmployee = new Map<number, typeof records>();
  for (const record of records) {
    if (!record.workDate || !record.employeeId) continue;
    const byDate = recordsByDate.get(record.workDate) ?? [];
    byDate.push(record);
    recordsByDate.set(record.workDate, byDate);

    const byEmployee = recordsByEmployee.get(record.employeeId) ?? [];
    byEmployee.push(record);
    recordsByEmployee.set(record.employeeId, byEmployee);
  }

  const inspectDays = getDaysToInspect(
    facts.target.year,
    facts.target.month,
    facts.workSchedule,
    facts.holidayDates,
    facts.adjustedWorkdayDates,
  );
  const missingDates = inspectDays.filter(date => !recordsByDate.has(date));

  return {
    ...facts,
    employees: scope as typeof facts.employees,
    salary,
    records,
    recordsByEmployee,
    missingDates,
    specialRecords: records.filter(record => isActionableStatus(record.status)),
  };
}

function summarizeEmployee(
  employee: EmployeeStub,
  facts: MonthFacts,
) {
  const salary = facts.salary.find(item => item.id === employee.id);
  const records = facts.recordsByEmployee.get(employee.id) ?? [];
  const specials = records.filter(record => isActionableStatus(record.status));
  const inspectDays = getDaysToInspect(
    facts.target.year,
    facts.target.month,
    facts.workSchedule,
    facts.holidayDates,
    facts.adjustedWorkdayDates,
  );
  const recordDates = new Set(records.map(record => record.workDate).filter(Boolean));
  const missingDates = inspectDays.filter(date => !recordDates.has(date));

  if (!salary) {
    return `${employee.name} ${facts.target.year}年${facts.target.month}月没有工资数据。`;
  }

  const pieces = [
    `${employee.name} ${facts.target.year}年${facts.target.month}月：${formatHours(salary.totalHours)}小时，${wageText(facts.target)}${formatMoney(salary.totalWage)}元。`,
  ];

  if (missingDates.length > 0) {
    pieces.push(`漏录${missingDates.length}天：${formatHumanDates(missingDates.slice(0, 4))}${missingDates.length > 4 ? '等' : ''}。`);
  }

  if (specials.length > 0) {
    const short = specials.slice(0, 4).map(record => {
      const label = record.statusLabel || STATUS_LABELS[String(record.status)] || '特殊';
      return `${record.workDate ? formatHumanDate(record.workDate) : ''} ${label}`;
    });
    pieces.push(`特殊记录${specials.length}条：${short.join('、')}${specials.length > 4 ? '等' : ''}。`);
  }

  if (missingDates.length === 0 && specials.length === 0) {
    pieces.push('目前没有发现漏录或特殊状态。');
  }

  return pieces.join('');
}

function summarizeAnomalies(facts: MonthFacts, label = '') {
  const lines: string[] = [];

  if (facts.missingDates.length > 0) {
    lines.push(`全员漏录${facts.missingDates.length}天：${formatHumanDates(facts.missingDates.slice(0, 5))}${facts.missingDates.length > 5 ? '等' : ''}。`);
  }

  const byEmployee = new Map<number, string[]>();
  for (const record of facts.specialRecords) {
    if (!record.employeeId || !record.workDate) continue;
    const label = record.statusLabel || STATUS_LABELS[String(record.status)] || '特殊';
    const items = byEmployee.get(record.employeeId) ?? [];
    items.push(`${formatHumanDate(record.workDate)} ${label}`);
    byEmployee.set(record.employeeId, items);
  }

  for (const [employeeId, items] of byEmployee) {
    const employee = facts.employees.find(item => item.id === employeeId);
    if (!employee) continue;
    lines.push(`${employee.name}：${items.slice(0, 4).join('、')}${items.length > 4 ? '等' : ''}。`);
  }

  if (lines.length === 0) {
    return `${facts.target.year}年${facts.target.month}月${label ? `${label}` : ''}暂时没有发现漏录或特殊状态。`;
  }

  return `${facts.target.year}年${facts.target.month}月${label ? `${label}` : ''}有这些需要看一下：${lines.join('')}`;
}

function summarizeLeaveRanking(facts: MonthFacts) {
  const byEmployee = new Map<number, string[]>();

  for (const record of facts.records) {
    if (record.status !== 'leave' || !record.employeeId || !record.workDate) continue;
    const dates = byEmployee.get(record.employeeId) ?? [];
    dates.push(record.workDate);
    byEmployee.set(record.employeeId, dates);
  }

  if (byEmployee.size === 0) {
    return `${facts.target.year}年${facts.target.month}月没有请假记录。`;
  }

  const ranked = [...byEmployee.entries()]
    .map(([employeeId, dates]) => ({
      employee: facts.employees.find(item => item.id === employeeId),
      dates: dates.sort(),
    }))
    .filter(item => Boolean(item.employee))
    .map(item => ({ employee: item.employee!, dates: item.dates }))
    .sort((a, b) => b.dates.length - a.dates.length);

  const maxCount = ranked[0]?.dates.length ?? 0;
  const top = ranked.filter(item => item.dates.length === maxCount);
  const names = top.map(item => item.employee.name).join('、');
  const dates = top.flatMap(item => item.dates).slice(0, 6);

  return `${facts.target.year}年${facts.target.month}月请假最多的是${names}，共${maxCount}天。${dates.length > 0 ? `日期：${formatHumanDates(dates)}。` : ''}`;
}

function summarizeStatusRanking(
  facts: MonthFacts,
  status: string,
  label = '',
  order: 'top' | 'bottom' = 'top',
) {
  const statusLabel = STATUS_LABELS[status] || status;
  const prefix = `${facts.target.year}年${facts.target.month}月${label ? `${label}中` : ''}`;

  // Build full map including employees with 0 days (needed for bottom)
  const countMap = new Map<number, string[]>();
  for (const emp of facts.employees) countMap.set(emp.id, []);
  for (const record of facts.records) {
    if (record.status !== status || !record.employeeId || !record.workDate) continue;
    countMap.get(record.employeeId)?.push(record.workDate);
  }

  const ranked = [...countMap.entries()]
    .map(([employeeId, dates]) => ({
      employee: facts.employees.find(e => e.id === employeeId)!,
      dates: dates.sort(),
    }))
    .filter(item => Boolean(item.employee))
    .sort((a, b) => b.dates.length - a.dates.length);

  if (order === 'bottom') {
    const minCount = ranked[ranked.length - 1]?.dates.length ?? 0;
    const bottom = ranked.filter(item => item.dates.length === minCount);
    const names = bottom.map(item => item.employee.name).join('、');
    return minCount === 0
      ? `${prefix}${names}没有${statusLabel}记录，${bottom.length > 1 ? '并列' : ''}最少。`
      : `${prefix}${statusLabel}最少的是${names}，共${minCount}天。`;
  }

  if (ranked[0].dates.length === 0) {
    return `${facts.target.year}年${facts.target.month}月${label ? `${label}` : ''}没有${statusLabel}记录。`;
  }
  const maxCount = ranked[0].dates.length;
  const top = ranked.filter(item => item.dates.length === maxCount);
  return `${prefix}${statusLabel}最多的是${top.map(item => item.employee.name).join('、')}，共${maxCount}天。`;
}

function summarizeMissing(facts: MonthFacts, label = '') {
  if (facts.missingDates.length === 0) {
    return `${facts.target.year}年${facts.target.month}月${label ? `${label}` : ''}暂时没有发现整天漏录。`;
  }
  return `${facts.target.year}年${facts.target.month}月${label ? `${label}` : ''}有${facts.missingDates.length}天整天漏录：${formatHumanDates(facts.missingDates.slice(0, 6))}${facts.missingDates.length > 6 ? '等' : ''}。`;
}

function summarizeEmployeeByMetrics(
  employee: EmployeeStub,
  facts: MonthFacts,
  metrics: string[] = [],
) {
  const salary = facts.salary.find(item => item.id === employee.id);
  if (!salary) return `${employee.name} ${facts.target.year}年${facts.target.month}月没有工资数据。`;

  const wantsHours = metrics.includes('hours') || metrics.includes('work_hours');
  const wantsWage = metrics.includes('wage') || metrics.includes('salary') || metrics.includes('money');
  const wantsCount = metrics.includes('count') || metrics.includes('days');

  if (wantsHours && !wantsWage && !wantsCount) {
    return `${employee.name} ${facts.target.year}年${facts.target.month}月共${formatHours(salary.totalHours)}小时。`;
  }

  if (wantsWage && !wantsHours && !wantsCount) {
    return `${employee.name} ${facts.target.year}年${facts.target.month}月${wageText(facts.target)}${formatMoney(salary.totalWage)}元。`;
  }

  return summarizeEmployee(employee, facts);
}

function summarizeSalary(facts: MonthFacts, label = '', order: 'top' | 'bottom' = 'top') {
  const active = facts.salary.filter(item => item.totalHours > 0);
  const prefix = `${facts.target.year}年${facts.target.month}月${label || ''}`;

  if (active.length === 0) {
    return `${prefix}还没有可统计的工时。`;
  }

  const sorted = [...active].sort((a, b) => b.totalHours - a.totalHours);
  const totalHours = active.reduce((sum, item) => sum + item.totalHours, 0);
  const totalWage  = active.reduce((sum, item) => sum + item.totalWage,  0);

  if (order === 'bottom') {
    const pick = sorted[sorted.length - 1];
    return `${prefix}工时最少的是${pick.name}，共${formatHours(pick.totalHours)}小时。`;
  }

  const pick = sorted[0];
  return `${prefix}共${formatHours(totalHours)}小时，${wageText(facts.target)}${formatMoney(totalWage)}元。工时最多是${pick.name}，${formatHours(pick.totalHours)}小时。`;
}

function summarizeSalaryList(facts: MonthFacts, label = '', metrics: string[] = []) {
  const active = facts.salary.filter(item => item.totalHours > 0);
  const wantsWage = metrics.includes('wage') || metrics.includes('salary') || metrics.includes('money');
  const sorted = [...active].sort((a, b) => b.totalHours - a.totalHours);

  if (sorted.length === 0) {
    return `${facts.target.year}年${facts.target.month}月${label || ''}还没有可列出的工时。`;
  }

  const lines = sorted.map((item, index) => {
    const wage = wantsWage ? `，${wageText(facts.target)}${formatMoney(item.totalWage)}元` : '';
    return `${index + 1}. ${item.name} ${formatHours(item.totalHours)}小时${wage}`;
  });

  return `${facts.target.year}年${facts.target.month}月${label || ''}工时排序：\n${lines.join('\n')}`;
}

function summarizeEmployeeProfile(scope: EmployeeStub[], metrics: string[], order: 'top' | 'bottom' = 'top'): string {
  if (scope.length === 0) return '没有找到符合条件的员工。';

  const wantsHireDate = metrics.includes('hireDate') || metrics.length === 0;
  const wantsRate = metrics.includes('hourlyRate');

  if (wantsRate && !wantsHireDate) {
    const withRate = scope.filter(e => e.currentHourlyRate);
    if (withRate.length === 0) return '没有工价数据。';
    const sorted = [...withRate].sort((a, b) => {
      const diff = parseFloat(String(b.currentHourlyRate)) - parseFloat(String(a.currentHourlyRate));
      return order === 'top' ? diff : -diff;
    });
    const pick = sorted[0];
    const rate = parseFloat(String(pick.currentHourlyRate)).toFixed(2);
    const label = order === 'top' ? '工价最高' : '工价最低';
    const runner = sorted[1];
    const runnerLine = runner ? `其次是${runner.name}，${parseFloat(String(runner.currentHourlyRate)).toFixed(2)}元/时。` : '';
    return `${scope.length > 1 ? '其中' : ''}${pick.name}${label}，${rate}元/时。${runnerLine}`;
  }

  // hireDate comparison
  const withDate = scope.filter(e => e.hireDate);
  if (withDate.length === 0) return '没有入职日期数据。';
  // top = 入职最久 = 日期最小（最早）; bottom = 最新入职 = 日期最大（最晚）
  const sorted = [...withDate].sort((a, b) =>
    order === 'top' ? a.hireDate!.localeCompare(b.hireDate!) : b.hireDate!.localeCompare(a.hireDate!)
  );
  const pick = sorted[0];
  const label = order === 'top' ? '入职最久' : '入职最新';
  const hireParts = pick.hireDate!.slice(0, 7).split('-');
  const hireStr = `${hireParts[0]}年${parseInt(hireParts[1])}月`;
  const now = new Date();
  const hireMs = new Date(pick.hireDate!).getTime();
  const months = Math.floor((now.getTime() - hireMs) / (1000 * 60 * 60 * 24 * 30.44));
  const tenureStr = months >= 12
    ? `约${Math.floor(months / 12)}年${months % 12 > 0 ? `${months % 12}个月` : ''}`
    : `约${months}个月`;
  const runner = sorted[1];
  const runnerLine = runner
    ? `其次是${runner.name}，入职于${runner.hireDate!.slice(0, 7).replace('-', '年').replace(/-(\d+)/, (_, m) => `${parseInt(m)}月`)}。`
    : '';
  return `${scope.length > 1 ? '其中' : ''}${pick.name}${label}，入职于${hireStr}，已工作${tenureStr}。${runnerLine}`;
}

function wantsListOutput(metrics: string[] = []) {
  return metrics.some(metric => ['list', 'all'].includes(metric));
}

function isPayslipIntent(message: string) {
  return /工资条|工资|薪资|多少钱|多少(钱|工资)/.test(message);
}

function isRankingIntent(message: string) {
  return /最多|最少|最高|最低|排名|排行|排序|第一|前\d+|后\d+|谁.*[多少]|哪个.*[多少]|哪位.*[多少]/.test(message);
}

function shouldPreferEmployeeMonthWage(
  message: string,
  plan: AssistantPlan,
  employee: EmployeeStub | null,
) {
  if (!employee) return false;
  if (plan.intent === 'QUERY_EMPLOYEE_MONTH' || plan.intent === 'OPEN_PAYSLIP') return false;
  return isPayslipIntent(message) && !isRankingIntent(message);
}

function isAnomalyIntent(message: string) {
  return /异常|不正常|问题|漏录|没录|旷工/.test(message);
}

function isLeaveRankingIntent(message: string) {
  return /请假/.test(message) && /(最多|最多的|谁|哪个|哪位|排名)/.test(message);
}

function isOpenEmployeeIntent(message: string) {
  return /(打开|查看|看一下|看看).*(资料|档案|信息)|(资料|档案|信息).*(打开|查看|看一下|看看)/.test(message);
}

function isModelQuestion(message: string) {
  return /什么模型|哪个模型|模型是什么|你是.*模型|用的.*模型|model/i.test(message);
}

function isCapabilityQuestion(message: string) {
  return /你能.*做|你.*能做|能帮.*什么|有什么功能|能查什么|会什么|你.*会|你.*能|怎么用|如何使用|能干嘛|能干啥/.test(message);
}

function modelReply(config: AIProviderConfig | null) {
  if (!config) {
    return '现在没有启用外部 AI 模型，聊天会走本地规则。';
  }
  return `当前启用的是 ${config.provider} / ${config.model}。`;
}

function extractJsonValue(value: string): AssistantPlan | AssistantPlan[] | null {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? value;
  const arrStart = raw.indexOf('[');
  const objStart = raw.indexOf('{');
  if (arrStart >= 0 && (objStart < 0 || arrStart < objStart)) {
    const arrEnd = raw.lastIndexOf(']');
    if (arrEnd > arrStart) {
      try {
        const parsed = JSON.parse(raw.slice(arrStart, arrEnd + 1));
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as AssistantPlan[];
      } catch { /* fall through */ }
    }
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as AssistantPlan;
  } catch {
    return null;
  }
}

async function callAIChat(
  config: AIProviderConfig,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  temperature = 0.1,
) {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature,
        messages,
      }),
    });
  } catch {
    throw new AIProviderConnectionError();
  }

  if (!response.ok) {
    throw new AIProviderConnectionError(`AI provider returned ${response.status}`);
  }

  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  } catch {
    throw new AIProviderConnectionError('AI provider returned invalid JSON');
  }

  return data.choices?.[0]?.message?.content?.trim() || null;
}

async function planWithAI(
  question: string,
  employees: EmployeeStub[],
  config: AIProviderConfig,
  history: AssistantHistoryItem[] = [],
  lastPlan: AssistantPlan | null = null,
  pageUrl?: string | null,
): Promise<AssistantPlan[]> {
  const content = await callAIChat(config, [
    {
      role: 'system',
      content: [
        '你是工厂考勤助手的“查询计划员”。',
        '你的任务不是回答用户，而是把用户问题解析成一个 JSON 查询计划。',
        '只能返回 JSON，不要 Markdown，不要解释。',
        '允许的 intent：QUERY_EMPLOYEE_MONTH, QUERY_STATUS_RANKING, QUERY_MONTH_SUMMARY, QUERY_RANGE_SUMMARY, QUERY_EMPLOYEE_PROFILE, QUERY_MISSING, QUERY_ANOMALY, OPEN_PAYSLIP, OPEN_EMPLOYEE, OPEN_SALARY, CLARIFY。',
        'status 只能是 worked, leave, holiday, sick, absent, custom 之一；请假=leave，病假=sick，旷工=absent，休息/放假=holiday，正常/上班=worked。',
        'metrics 可用：hours, wage, count, days, records, ranking, list。',
        'employeeFilter 可用字段：gender, status, positionName, nameContains, minHourlyRate, maxHourlyRate。',
        '女员工/女性=gender:female；男员工/男性=gender:male；在职=status:active；名字里有某字=nameContains。',
        '上班最多、上班最久、工时最多表示按 totalHours 排名，应使用 QUERY_MONTH_SUMMARY + metrics:["hours","ranking"]，不要理解成 worked 天数最多。',
        '只要用户问题是“具体员工/称呼 + 工资/薪资/多少钱”，必须优先使用 QUERY_EMPLOYEE_MONTH + metrics:["wage"]，并填入 employeeId；不要输出 QUERY_RANGE_SUMMARY，也不要当成工时最多排名。除非用户明确说“全年汇总/总共/合计/排行”。',
        '异常、漏录、汇总、排行类问题如果没有指定员工，默认全员，不要反问员工。',
        '如果用户说”这几个人””刚才那些人””按刚才的””每个人列出来”，必须优先继承 lastPlan 的 employeeFilter、year、month、status 和 metrics，再按当前问题修改输出方式。',
        '如果用户说”这两个人””这几个人””他们””刚才说的那几个””第一和第二”等代词，必须从 recentConversation 的 assistant 最近回复中提取出具体姓名，填入 employeeNames 数组（如 [“林一鸣”,”何二朗”]），不要反问用户是谁。',
        'QUERY_EMPLOYEE_PROFILE 用于查询员工基本资料（入职时间/工龄/工价/时薪）：谁入职最久/最新、谁工价最高/最低、某人何时入职。metrics 可为 hireDate（入职/工龄）或 hourlyRate（工价/时薪），order: top=最久/最高，order: bottom=最新/最低。支持 employeeNames、employeeFilter、employeeId 限定范围。',
        '如果用户要求“列出来”“每个人”“排序”“排名”，metrics 必须包含 list 和 ranking。',
        '如果能从员工列表唯一确定员工，请填 employeeId；例如“姓谢的员工”且只有一个谢姓员工，就填对应 employeeId。',
        '如果月份没说，默认当前年月；”去年4月”按当前日期往前一年。',
        'QUERY_RANGE_SUMMARY 用于跨月/跨年问题（去年全年、今年上半年、近N个月、某季度、某年度等），输出 startDate 和 endDate（YYYY-MM-DD）。',
        '”去年” → startDate=去年1月1日，endDate=去年12月31日。',
        '”今年上半年” → startDate=今年01-01，endDate=今年06-30。',
        '”今年” → startDate=今年01-01，endDate=今天。',
        '”近3个月” → startDate=3个月前1号，endDate=今天。',
        '”第一季度/Q1” → 01-01至03-31，”第二季度/Q2” → 04-01至06-30，以此类推。',
        'QUERY_RANGE_SUMMARY 不需要 year/month 字段，只需要 startDate/endDate、metrics，可选 status（病假/请假/旷工等跨月状态查询时设置）。',
        '如果当前问题很短，例如“休息日吧”“那请假呢”，必须结合 recentConversation 补全员工、月份、状态等上下文。',
        'order 字段表示排名方向：最懒/工时最少/最不勤快/出勤最少/请假最少/旷工最少/最低 → order:bottom；最勤快/工时最多/出勤最多/请假最多/旷工最多/最高 → order:top。',
        '用户问"谁/哪个"且含最高/最低意味着只想要一个人的答案，不需要全榜，metrics 里不要放 ranking/list；明确说"列出来""每个人""排名""排序"才在 metrics 里放 list。',
        'currentPageUrl 是用户当前所在页面。若 URL 含 /employees/[id] 或 /salary/[id]，说明用户正在查看该员工，提问中出现"他""她""这个人""上个月工资"等省略主语时，应将该 id 对应员工填入 employeeId。',
        'QUERY_MISSING 专指"整天没有录入任何人"的日期（全员空白）；QUERY_ANOMALY 指已录入但含异常状态（请假/病假/旷工）或个别人漏录。"有没有漏录""谁没录"→QUERY_MISSING；"有没有异常""谁请假/旷工了"→QUERY_ANOMALY。',
        '"近期""最近""这段时间" 无具体天数时，默认近7天（startDate=7天前，endDate=今天）；"最近几个月"默认近3个月；"最近半年"=近6个月；"最近一年"=近12个月。均使用 QUERY_RANGE_SUMMARY。',
        '如果问题无法落到允许 intent，返回 CLARIFY 和 clarifyingQuestion。',
        '如果用户在一条消息里提了多个独立问题，返回 JSON 数组，每个问题一个 plan 对象；只有一个问题时返回单个对象。',
        '后台业务规则仅作为理解口径参考，不允许扩大 intent 或执行写入：',
        config.rulesPrompt || '无额外规则。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        question,
        lastPlan,
        recentConversation: history.map(item => ({
          role: item.role,
          text: item.text.slice(0, 800),
        })),
        today: todayString(),
        currentPageUrl: pageUrl ?? null,
        employees: employees.map(employee => ({
          id: employee.id,
          name: employee.name,
          aliases: employee.aliases ?? [],
          gender: employee.gender,
          status: employee.status,
          positionName: employee.positionName,
          currentHourlyRate: employee.currentHourlyRate,
          hireDate: employee.hireDate ?? null,
        })),
        outputShape: {
          intent: 'QUERY_EMPLOYEE_MONTH',
          year: 2026,
          month: 2,
          employeeId: 8,
          employeeName: '某员工',
          employeeFilter: {
            type: 'surname',
            value: '谢',
            gender: null,
            status: 'active',
            positionName: null,
            nameContains: null,
          },
          status: null,
          metrics: ['hours'],
          confidence: 0.9,
          clarifyingQuestion: null,
        },
      }),
    },
  ], 0.05);

  if (!content) return [];
  const parsed = extractJsonValue(content);
  if (!parsed) return [];
  const plans = Array.isArray(parsed) ? parsed : [parsed];
  return plans.filter((p): p is AssistantPlan => Boolean(p?.intent));
}

function resolvePlanTarget(plan: AssistantPlan, originalQuestion: string): MonthTarget {
  if (
    typeof plan.year === 'number' &&
    typeof plan.month === 'number' &&
    plan.year >= 2000 &&
    plan.month >= 1 &&
    plan.month <= 12
  ) {
    return { year: plan.year, month: plan.month };
  }
  return parseMonthTarget(originalQuestion);
}

function resolvePlanEmployee(plan: AssistantPlan, employees: EmployeeStub[]) {
  if (typeof plan.employeeId === 'number') {
    const direct = employees.find(employee => employee.id === plan.employeeId);
    if (direct) return { employee: direct, ambiguous: [] as EmployeeStub[] };
  }

  const rawName = plan.employeeName || plan.employeeFilter?.value;
  if (rawName) {
    const matchedByText = matchEmployee(rawName, employees);
    if (matchedByText) return { employee: matchedByText, ambiguous: [] as EmployeeStub[] };
  }

  if (plan.employeeFilter?.type === 'surname' && plan.employeeFilter.value) {
    const matched = employees.filter(employee => employee.name?.startsWith(plan.employeeFilter?.value ?? ''));
    if (matched.length === 1) return { employee: matched[0], ambiguous: [] as EmployeeStub[] };
    if (matched.length > 1) return { employee: null, ambiguous: matched };
  }

  return { employee: null, ambiguous: [] as EmployeeStub[] };
}

function normalizePlanStatus(status: string | null | undefined) {
  if (!status) return 'leave';
  const allowed = new Set(['worked', 'leave', 'holiday', 'sick', 'absent', 'custom']);
  return allowed.has(status) ? status : 'leave';
}

function employeeIdFromUrl(pageUrl: string | null | undefined): number | null {
  if (!pageUrl) return null;
  const m = pageUrl.match(/\/(?:employees|salary)\/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

async function executePlan(
  plan: AssistantPlan,
  question: string,
  employees: EmployeeStub[],
  config: AIProviderConfig,
  history: AssistantHistoryItem[] = [],
  pageUrl?: string | null,
): Promise<AssistantResponse | null> {
  if (plan.intent === 'CLARIFY') {
    // 如果当前页面有员工 ID，且问题像月度查询，直接合成 plan 执行，不反问
    const urlEmpId = employeeIdFromUrl(pageUrl);
    if (urlEmpId) {
      const urlEmployee = employees.find(e => e.id === urlEmpId) ?? null;
      if (urlEmployee && /工资|工时|小时|出勤|上班|请假|病假|旷工|考勤/.test(question)) {
        const isWage = /工资|薪资|多少钱/.test(question);
        const syntheticPlan: AssistantPlan = {
          intent: 'QUERY_EMPLOYEE_MONTH',
          employeeId: urlEmpId,
          employeeName: urlEmployee.name,
          metrics: isWage ? ['wage'] : ['hours'],
        };
        return executePlan(syntheticPlan, question, employees, config, history, pageUrl);
      }
    }
    return {
      reply: plan.clarifyingQuestion || '我能查：某人某月工时/工资、全员排名、漏录、异常、请假/病假统计，也能帮你打开员工资料或工资单。你想查什么？',
      actions: [],
      mode: 'ai',
      planContext: plan,
    };
  }

  const target = resolvePlanTarget(plan, question);
  const actions: AssistantAction[] = [];
  const employeeScope = resolveEmployeeScope(plan, employees);
  const urlEmpId = employeeIdFromUrl(pageUrl);
  const employee = employeeScope.employee
    ?? matchEmployee(question, employees)
    ?? (urlEmpId ? (employees.find(e => e.id === urlEmpId) ?? null) : null);
  const label = scopeLabel(plan.employeeFilter, employeeScope.scope.length);

  if (employee && shouldPreferEmployeeMonthWage(question, plan, employee)) {
    const wageEmployee = employee;
    return executePlan({
      ...plan,
      intent: 'QUERY_EMPLOYEE_MONTH',
      year: target.year,
      month: target.month,
      employeeId: wageEmployee.id,
      employeeName: wageEmployee.name,
      employeeFilter: null,
      status: null,
      order: null,
      metrics: ['wage'],
    }, question, employees, config, history, pageUrl);
  }

  if (plan.intent === 'QUERY_RANGE_SUMMARY') {
    const startDate = typeof plan.startDate === 'string' ? plan.startDate : null;
    const endDate   = typeof plan.endDate   === 'string' ? plan.endDate   : null;
    if (!startDate || !endDate) {
      return { reply: '没能识别出查询的时间范围，请说得更具体，比如"去年全年"或"2025年上半年"。', actions: [], mode: 'ai', planContext: plan };
    }
    const rangeFacts = await buildRangeFacts(startDate, endDate);
    const { scope } = resolveEmployeeScope(plan, rangeFacts.employees);
    const filteredFacts: RangeFacts = {
      ...rangeFacts,
      employees: scope as EmployeeStub[],
      ranking: rangeFacts.ranking.filter(r => scope.some(e => e.id === r.id)),
    };
    const rangeOrder = plan.order === 'bottom' ? 'bottom' : 'top';
    return { reply: summarizeRangeFacts(filteredFacts, plan.metrics ?? [], rangeOrder, plan.status), actions: [], mode: 'ai', planContext: plan };
  }

  if (plan.intent === 'QUERY_EMPLOYEE_PROFILE') {
    const { scope } = resolveEmployeeScope(plan, employees);
    const profileOrder = plan.order === 'bottom' ? 'bottom' : 'top';
    return { reply: summarizeEmployeeProfile(scope, plan.metrics ?? [], profileOrder), actions: [], mode: 'ai', planContext: plan };
  }

  if (employeeScope.scope.length === 0 && !employee) {
    return { reply: '没有找到符合条件的员工。', actions: [], mode: 'ai', planContext: plan };
  }

  if (plan.intent === 'OPEN_EMPLOYEE') {
    if (!employee) return { reply: '你想打开哪位员工的资料？', actions: [], mode: 'ai', planContext: plan };
    actions.push({ type: 'OPEN_EMPLOYEE', label: '打开员工资料', href: `/employees/${employee.id}` });
    return { reply: `已打开${employee.name}的资料。`, actions, mode: 'ai', planContext: plan, autoNavigate: true };
  }

  if (plan.intent === 'OPEN_PAYSLIP') {
    if (!employee) return { reply: '你想看哪位员工的工资条？', actions: [], mode: 'ai', planContext: plan };
    actions.push({
      type: 'OPEN_PAYSLIP',
      label: '打开工资条',
      href: `/salary/${employee.id}?year=${target.year}&month=${target.month}`,
    });
    return { reply: `已打开${employee.name} ${target.year}年${target.month}月工资条。`, actions, mode: 'ai', planContext: plan, autoNavigate: true };
  }

  if (plan.intent === 'OPEN_SALARY') {
    actions.push({ type: 'OPEN_SALARY', label: '打开月度工资', href: `/salary?year=${target.year}&month=${target.month}` });
    return { reply: `已打开${target.year}年${target.month}月工资。`, actions, mode: 'ai', planContext: plan, autoNavigate: true };
  }

  const facts = await buildMonthFacts(target);
  const scopedFacts = scopeMonthFacts(facts, employeeScope.scope);

  if (plan.intent === 'QUERY_EMPLOYEE_MONTH') {
    if (!employee) {
      const names = employeeScope.scope.map((e, i) => `${i + 1}. ${e.name}`).join('、');
      return {
        reply: `找到${employeeScope.scope.length}位：${names}。请说名字告诉我查哪一位？`,
        actions: [],
        mode: 'ai',
        planContext: plan,
      };
    }
    actions.push({
      type: 'OPEN_PAYSLIP',
      label: '看工资条',
      href: `/salary/${employee.id}?year=${target.year}&month=${target.month}`,
    });
    return {
      reply: summarizeEmployeeByMetrics(employee, facts, plan.metrics),
      actions,
      mode: 'ai',
      planContext: plan,
    };
  }

  if (plan.intent === 'QUERY_STATUS_RANKING') {
    actions.push({ type: 'OPEN_SALARY', label: '打开月度工资', href: `/salary?year=${target.year}&month=${target.month}` });
    return {
      reply: summarizeStatusRanking(scopedFacts, normalizePlanStatus(plan.status), label, plan.order === 'bottom' ? 'bottom' : 'top'),
      actions,
      mode: 'ai',
      planContext: plan,
    };
  }

  if (plan.intent === 'QUERY_MISSING') {
    actions.push({ type: 'OPEN_SALARY', label: '打开月度工资', href: `/salary?year=${target.year}&month=${target.month}` });
    return { reply: summarizeMissing(scopedFacts, label), actions, mode: 'ai', planContext: plan };
  }

  if (plan.intent === 'QUERY_ANOMALY') {
    actions.push({ type: 'OPEN_SALARY', label: '打开月度工资', href: `/salary?year=${target.year}&month=${target.month}` });
    return { reply: summarizeAnomalies(scopedFacts, label), actions, mode: 'ai', planContext: plan };
  }

  if (plan.intent === 'QUERY_MONTH_SUMMARY') {
    actions.push({ type: 'OPEN_SALARY', label: '打开月度工资', href: `/salary?year=${target.year}&month=${target.month}` });
    const monthOrder = plan.order === 'bottom' ? 'bottom' : 'top';
    return {
      reply: wantsListOutput(plan.metrics)
        ? summarizeSalaryList(scopedFacts, label, plan.metrics ?? [])
        : summarizeSalary(scopedFacts, label, monthOrder),
      actions,
      mode: 'ai',
      planContext: plan,
    };
  }

  return null;
}

async function answerWithAIPlan(
  question: string,
  employees: EmployeeStub[],
  config: AIProviderConfig,
  history: AssistantHistoryItem[] = [],
  lastPlan: AssistantPlan | null = null,
): Promise<AssistantResponse | null> {
  const plans = await planWithAI(question, employees, config, history, lastPlan);
  if (!plans.length) return null;
  return executePlan(plans[0], question, employees, config, history);
}

async function callConfiguredAI(question: string, facts: unknown) {
  const config = await getAIProviderConfig();
  if (!config) return null;

  return callAIChat(config, [
    {
      role: 'system',
      content: [
        '你是一个工厂考勤助手。',
        '以下是后台人工配置的业务规则，必须遵守：',
        config.rulesPrompt || '无额外规则。',
        '以下是固定安全规则，优先级高于后台业务规则：',
        '只能依据用户提供的 facts 回答。',
        'facts 没有的数据必须说未查询到，不能猜测原因。',
        '不能声称自己已经修改、保存、删除或新增任何考勤数据。',
        '回答要短，必须用中文。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({ question, facts }),
    },
  ], 0.2);
}

export async function* answerAttendanceAssistantStream(
  message: string,
  history: AssistantHistoryItem[] = [],
  lastPlan: AssistantPlan | null = null,
  pageUrl?: string | null,
): AsyncGenerator<AssistantResponse> {
  const cleaned = message.trim();
  if (!cleaned) {
    yield { reply: '你想查谁、哪一个月？', actions: [], mode: 'rules' };
    return;
  }

  const aiConfig = await getAIProviderConfig();
  if (isModelQuestion(cleaned)) {
    yield { reply: modelReply(aiConfig), actions: [], mode: aiConfig ? 'ai' : 'rules' };
    return;
  }

  if (isCapabilityQuestion(cleaned)) {
    yield {
      reply: '我能帮你查：\n・某人某月的工时、工资\n・全员工时/工资排名\n・本月漏录情况\n・请假、病假、旷工统计\n・跨月/跨年的出勤汇总\n・员工入职时间、工价对比\n・打开员工资料或工资单\n\n直接问就行，比如"谁上个月工时最多"。',
      actions: [],
      mode: 'rules',
    };
    return;
  }

  if (aiConfig) {
    try {
      const employeesForPlan = await getActiveEmployees();
      const plans = await planWithAI(cleaned, employeesForPlan, aiConfig, history, lastPlan, pageUrl);
      if (plans.length > 0) {
        for (const plan of plans) {
          const result = await executePlan(plan, cleaned, employeesForPlan, aiConfig, history, pageUrl);
          if (result) yield result;
        }
        return;
      }
    } catch (error) {
      if (isAIProviderConnectionError(error)) {
        yield aiConnectionFailedResponse();
        return;
      }
      throw error;
    }
  } else {
    const availability = await getAIAvailability();
    if (availability.hasApiKey && !availability.enabled) {
      yield aiDisabledResponse();
      return;
    }
  }

  const target = parseMonthTarget(cleaned);
  const facts = await buildMonthFacts(target);
  const employee = matchEmployee(cleaned, facts.employees);
  const actions: AssistantAction[] = [];

  if (employee && isPayslipIntent(cleaned)) {
    actions.push({ type: 'OPEN_PAYSLIP', label: '打开工资条', href: `/salary/${employee.id}?year=${target.year}&month=${target.month}` });
    yield { reply: summarizeEmployee(employee, facts), actions, mode: 'rules' };
    return;
  }

  if (employee && isOpenEmployeeIntent(cleaned)) {
    actions.push({ type: 'OPEN_EMPLOYEE', label: '打开员工资料', href: `/employees/${employee.id}` });
    yield { reply: `已打开${employee.name}的资料。`, actions, mode: 'rules', autoNavigate: true };
    return;
  }

  if (employee) {
    actions.push({ type: 'OPEN_PAYSLIP', label: '看工资条', href: `/salary/${employee.id}?year=${target.year}&month=${target.month}` });
    yield { reply: summarizeEmployee(employee, facts), actions, mode: 'rules' };
    return;
  }

  if (isLeaveRankingIntent(cleaned)) {
    actions.push({ type: 'OPEN_SALARY', label: '打开月度工资', href: `/salary?year=${target.year}&month=${target.month}` });
    yield { reply: summarizeLeaveRanking(facts), actions, mode: 'rules' };
    return;
  }

  if (isAnomalyIntent(cleaned)) {
    actions.push({ type: 'OPEN_SALARY', label: '打开月度工资', href: `/salary?year=${target.year}&month=${target.month}` });
    yield { reply: summarizeAnomalies(facts), actions, mode: 'rules' };
    return;
  }

  if (isPayslipIntent(cleaned) || /汇总|总共|合计/.test(cleaned)) {
    actions.push({ type: 'OPEN_SALARY', label: '打开月度工资', href: `/salary?year=${target.year}&month=${target.month}` });
    yield { reply: summarizeSalary(facts), actions, mode: 'rules' };
    return;
  }

  if (!aiConfig) {
    const availability = await getAIAvailability();
    if (!availability.hasApiKey) {
      yield aiNotConfiguredResponse();
      return;
    }
    if (!availability.enabled) {
      yield aiDisabledResponse();
      return;
    }
  }

  let aiReply: string | null = null;
  try {
    aiReply = await callConfiguredAI(cleaned, {
      month: facts.target,
      employees: facts.employees.map(item => ({ id: item.id, name: item.name, aliases: item.aliases ?? [] })),
      salary: facts.salary.map(item => ({
        id: item.id,
        name: item.name,
        totalHours: item.totalHours,
        totalWage: item.totalWage,
        recordCount: item.recordCount,
      })),
      missingDates: facts.missingDates,
      specialRecords: facts.specialRecords.slice(0, 40).map(item => ({
        employeeId: item.employeeId,
        workDate: item.workDate,
        status: item.status,
        statusLabel: item.statusLabel,
      })),
    });
  } catch (error) {
    if (isAIProviderConnectionError(error)) {
      yield aiConnectionFailedResponse();
      return;
    }
    throw error;
  }

  if (aiReply) {
    yield { reply: aiReply, actions, mode: 'ai' };
    return;
  }

  yield {
    reply: '我现在能查员工、工资条、工资汇总和本月异常。你可以问：某员工去年4月工资条，或者本月谁漏录了。',
    actions: [],
    mode: 'rules',
  };
}

export async function answerAttendanceAssistant(
  message: string,
  history: AssistantHistoryItem[] = [],
  lastPlan: AssistantPlan | null = null,
): Promise<AssistantResponse> {
  for await (const result of answerAttendanceAssistantStream(message, history, lastPlan)) {
    return result;
  }
  return {
    reply: '我现在能查员工、工资条、工资汇总和本月异常。你可以问：某员工去年4月工资条，或者本月谁漏录了。',
    actions: [],
    mode: 'rules',
  };
}
