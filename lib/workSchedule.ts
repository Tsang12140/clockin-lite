import type { WorkScheduleConfig } from '@/db/schema';

export type WorkScheduleMode = WorkScheduleConfig['type'];

export const DEFAULT_WORK_SCHEDULE = {
  type: 'single',
  restDays: [0],
} satisfies WorkScheduleConfig;

const DAY_COUNT = 7;

function toDateParts(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function toUtcDate(date: string) {
  const { year, month, day } = toDateParts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateString(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addDays(date: string, days: number) {
  const { year, month, day } = toDateParts(date);
  return toDateString(new Date(Date.UTC(year, month - 1, day + days)));
}

export function getDayOfWeek(date: string): number {
  return toUtcDate(date).getUTCDay();
}

export function getScheduleWeekStart(date: string): string {
  const dow = getDayOfWeek(date);
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

export function todayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function normalizeRestDays(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return [...fallback];
  const days = value
    .map(day => Number(day))
    .filter(day => Number.isInteger(day) && day >= 0 && day < DAY_COUNT);
  return [...new Set(days)].sort((a, b) => a - b);
}

function hasRestDays(config: WorkScheduleConfig | null | undefined): config is Extract<WorkScheduleConfig, { type: 'single' | 'double' }> {
  return Boolean(config && (config.type === 'single' || config.type === 'double'));
}

export function normalizeWorkSchedule(config: WorkScheduleConfig | null | undefined): WorkScheduleConfig {
  if (!config) return { type: 'single', restDays: [...DEFAULT_WORK_SCHEDULE.restDays] };

  if (hasRestDays(config)) {
    const fallback = config.type === 'double' ? [0, 6] : [0];
    const restDays = normalizeRestDays(config.restDays, fallback);
    return {
      type: config.type,
      restDays: restDays.length > 0 ? restDays : fallback,
    };
  }

  if (config.type === 'biweekly') {
    const anchorDate = /^\d{4}-\d{2}-\d{2}$/.test(config.anchorDate)
      ? getScheduleWeekStart(config.anchorDate)
      : getScheduleWeekStart(todayDateString());
    const bigWeekRestDays = normalizeRestDays(config.bigWeekRestDays, [0]);
    const smallWeekRestDays = normalizeRestDays(config.smallWeekRestDays, [0, 6]);
    return {
      type: 'biweekly',
      bigWeekRestDays: bigWeekRestDays.length > 0 ? bigWeekRestDays : [0],
      smallWeekRestDays: smallWeekRestDays.length > 0 ? smallWeekRestDays : [0, 6],
      anchorDate,
      anchorIsBigWeek: config.anchorIsBigWeek !== false,
    };
  }

  return { type: 'single', restDays: [...DEFAULT_WORK_SCHEDULE.restDays] };
}

export function buildWorkSchedule(mode: WorkScheduleMode, anchorDate = todayDateString(), anchorIsBigWeek = true): WorkScheduleConfig {
  if (mode === 'double') {
    return { type: 'double', restDays: [0, 6] };
  }
  if (mode === 'biweekly') {
    return {
      type: 'biweekly',
      bigWeekRestDays: [0],
      smallWeekRestDays: [0, 6],
      anchorDate: getScheduleWeekStart(anchorDate),
      anchorIsBigWeek,
    };
  }
  return { type: 'single', restDays: [0] };
}

export function isBigWeek(date: string, config: WorkScheduleConfig | null | undefined): boolean {
  const schedule = normalizeWorkSchedule(config);
  if (schedule.type !== 'biweekly') return true;

  const targetMonday = getScheduleWeekStart(date);
  const anchorMonday = getScheduleWeekStart(schedule.anchorDate);
  const diffMs = toUtcDate(targetMonday).getTime() - toUtcDate(anchorMonday).getTime();
  const diffWeeks = Math.round(diffMs / (DAY_COUNT * 24 * 60 * 60 * 1000));
  const sameParity = Math.abs(diffWeeks) % 2 === 0;
  return sameParity ? schedule.anchorIsBigWeek : !schedule.anchorIsBigWeek;
}

export function getRestDaysForDate(date: string, config: WorkScheduleConfig | null | undefined): number[] {
  const schedule = normalizeWorkSchedule(config);
  if (schedule.type === 'biweekly') {
    return isBigWeek(date, schedule) ? schedule.bigWeekRestDays : schedule.smallWeekRestDays;
  }
  return schedule.restDays;
}

export function isRestDay(date: string, config: WorkScheduleConfig | null | undefined): boolean {
  return getRestDaysForDate(date, config).includes(getDayOfWeek(date));
}

function includesDate(date: string, dates?: Iterable<string>) {
  if (!dates) return false;
  if (dates instanceof Set) return dates.has(date);
  for (const item of dates) {
    if (item === date) return true;
  }
  return false;
}

export function isWorkday(
  date: string,
  config: WorkScheduleConfig | null | undefined,
  holidayDates?: Iterable<string>,
  adjustedWorkdayDates?: Iterable<string>,
): boolean {
  if (includesDate(date, adjustedWorkdayDates)) return true;
  if (includesDate(date, holidayDates)) return false;
  return !isRestDay(date, config);
}

export function describeWorkSchedule(config: WorkScheduleConfig | null | undefined): string {
  const schedule = normalizeWorkSchedule(config);
  if (schedule.type === 'double') return '双休';
  if (schedule.type === 'biweekly') return '大小周';
  return '单休';
}
