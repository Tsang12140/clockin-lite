import type { WorkScheduleConfig } from '@/db/schema';
import { isRestDay } from '@/lib/workSchedule';

export type SalaryRules = {
  standardDailyHours: number;
  weekday: number;
  weekdayOvertime: number;
  weekend: number;
  legalHoliday: number;
};

export type OvertimeMultipliers = SalaryRules;

export type WageSegmentKind = 'regular' | 'weekdayOvertime' | 'weekend' | 'legalHoliday';

export type WageSegment = {
  kind: WageSegmentKind;
  label: string;
  hours: number;
  rate: number;
  multiplier: number;
  wage: number;
};

export const DEFAULT_OVERTIME_MULTIPLIERS: SalaryRules = {
  standardDailyHours: 8,
  weekday: 1,
  weekdayOvertime: 1,
  weekend: 1,
  legalHoliday: 1,
};

function toMultiplier(value: unknown, fallback: number) {
  const next = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(next) || next <= 0) return fallback;
  return Math.min(10, Math.round(next * 100) / 100);
}

function toStandardHours(value: unknown, fallback: number) {
  const next = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(next) || next <= 0) return fallback;
  return Math.min(24, Math.round(next * 10) / 10);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function normalizeOvertimeMultipliers(input?: Partial<Record<keyof SalaryRules, unknown>> | null): SalaryRules {
  return {
    standardDailyHours: toStandardHours(input?.standardDailyHours, DEFAULT_OVERTIME_MULTIPLIERS.standardDailyHours),
    weekday: toMultiplier(input?.weekday, DEFAULT_OVERTIME_MULTIPLIERS.weekday),
    weekdayOvertime: toMultiplier(input?.weekdayOvertime, DEFAULT_OVERTIME_MULTIPLIERS.weekdayOvertime),
    weekend: toMultiplier(input?.weekend, DEFAULT_OVERTIME_MULTIPLIERS.weekend),
    legalHoliday: toMultiplier(input?.legalHoliday, DEFAULT_OVERTIME_MULTIPLIERS.legalHoliday),
  };
}

function hasDate(date: string, dates?: Iterable<string>) {
  if (!dates) return false;
  if (dates instanceof Set) return dates.has(date);
  for (const item of dates) {
    if (item === date) return true;
  }
  return false;
}

function makeSegment(input: {
  kind: WageSegmentKind;
  label: string;
  hours: number;
  rate: number;
  multiplier: number;
}): WageSegment {
  return {
    ...input,
    wage: roundMoney(input.hours * input.rate * input.multiplier),
  };
}

export function calculateDailyWage(input: {
  date: string;
  hours: number;
  rate: number;
  workSchedule: WorkScheduleConfig | null | undefined;
  legalHolidayDates?: Iterable<string>;
  adjustedWorkdayDates?: Iterable<string>;
  multipliers: SalaryRules;
}): { totalWage: number; segments: WageSegment[] } {
  const hours = Math.max(0, input.hours);
  if (hours <= 0 || input.rate <= 0) return { totalWage: 0, segments: [] };

  const rules = normalizeOvertimeMultipliers(input.multipliers);

  if (hasDate(input.date, input.legalHolidayDates)) {
    const segment = makeSegment({
      kind: 'legalHoliday',
      label: '法定节假日',
      hours,
      rate: input.rate,
      multiplier: rules.legalHoliday,
    });
    return { totalWage: segment.wage, segments: [segment] };
  }

  if (!hasDate(input.date, input.adjustedWorkdayDates) && isRestDay(input.date, input.workSchedule)) {
    const segment = makeSegment({
      kind: 'weekend',
      label: '休息日',
      hours,
      rate: input.rate,
      multiplier: rules.weekend,
    });
    return { totalWage: segment.wage, segments: [segment] };
  }

  const regularHours = Math.min(hours, rules.standardDailyHours);
  const overtimeHours = Math.max(0, hours - rules.standardDailyHours);
  const segments: WageSegment[] = [];

  if (regularHours > 0) {
    segments.push(makeSegment({
      kind: 'regular',
      label: '正常工时',
      hours: regularHours,
      rate: input.rate,
      multiplier: rules.weekday,
    }));
  }

  if (overtimeHours > 0) {
    segments.push(makeSegment({
      kind: 'weekdayOvertime',
      label: '加班工时',
      hours: overtimeHours,
      rate: input.rate,
      multiplier: rules.weekdayOvertime,
    }));
  }

  return {
    totalWage: roundMoney(segments.reduce((sum, segment) => sum + segment.wage, 0)),
    segments,
  };
}

export function calculateWageMultiplier(input: {
  date: string;
  workSchedule: WorkScheduleConfig | null | undefined;
  legalHolidayDates?: Iterable<string>;
  adjustedWorkdayDates?: Iterable<string>;
  multipliers: SalaryRules;
}): number {
  if (hasDate(input.date, input.legalHolidayDates)) return input.multipliers.legalHoliday;
  if (!hasDate(input.date, input.adjustedWorkdayDates) && isRestDay(input.date, input.workSchedule)) {
    return input.multipliers.weekend;
  }
  return input.multipliers.weekday;
}
