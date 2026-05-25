export type ChinaDayType = 'holiday' | 'workday';

export type ChinaHolidayItem = {
  date: string;
  name: string;
  type: ChinaDayType;
  source: string;
};

export type ChinaHolidayGroup = {
  name: string;
  dates: string[];
  startDate: string;
  endDate: string;
};

export type HolidayNotice = {
  id: string;
  title: string;
  message: string;
  groups: ChinaHolidayGroup[];
};

const SOURCES = {
  2025: 'State Council 2025 holiday notice',
  2026: 'State Council 2026 holiday notice',
} as const;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function dateOf(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

function range(start: string, end: string) {
  const dates: string[] = [];
  let current = start;
  while (current <= end) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

function holidayRange(name: string, start: string, end: string, source: string): ChinaHolidayItem[] {
  return range(start, end).map(date => ({ date, name, type: 'holiday', source }));
}

function adjustedWorkdays(name: string, dates: string[], source: string): ChinaHolidayItem[] {
  return dates.map(date => ({ date, name, type: 'workday', source }));
}

const CHINA_HOLIDAY_ITEMS: ChinaHolidayItem[] = [
  ...holidayRange('元旦', '2025-01-01', '2025-01-01', SOURCES[2025]),
  ...holidayRange('春节', '2025-01-28', '2025-02-04', SOURCES[2025]),
  ...holidayRange('清明节', '2025-04-04', '2025-04-06', SOURCES[2025]),
  ...holidayRange('劳动节', '2025-05-01', '2025-05-05', SOURCES[2025]),
  ...holidayRange('端午节', '2025-05-31', '2025-06-02', SOURCES[2025]),
  ...holidayRange('国庆节/中秋节', '2025-10-01', '2025-10-08', SOURCES[2025]),
  ...adjustedWorkdays('春节调休', ['2025-01-26', '2025-02-08'], SOURCES[2025]),
  ...adjustedWorkdays('劳动节调休', ['2025-04-27'], SOURCES[2025]),
  ...adjustedWorkdays('国庆中秋调休', ['2025-09-28', '2025-10-11'], SOURCES[2025]),

  ...holidayRange('元旦', '2026-01-01', '2026-01-03', SOURCES[2026]),
  ...holidayRange('春节', '2026-02-15', '2026-02-23', SOURCES[2026]),
  ...holidayRange('清明节', '2026-04-04', '2026-04-06', SOURCES[2026]),
  ...holidayRange('劳动节', '2026-05-01', '2026-05-05', SOURCES[2026]),
  ...holidayRange('端午节', '2026-06-19', '2026-06-21', SOURCES[2026]),
  ...holidayRange('中秋节', '2026-09-25', '2026-09-27', SOURCES[2026]),
  ...holidayRange('国庆节', '2026-10-01', '2026-10-07', SOURCES[2026]),
  ...adjustedWorkdays('元旦调休', ['2026-01-04'], SOURCES[2026]),
  ...adjustedWorkdays('春节调休', ['2026-02-14', '2026-02-28'], SOURCES[2026]),
  ...adjustedWorkdays('劳动节调休', ['2026-05-09'], SOURCES[2026]),
  ...adjustedWorkdays('国庆节调休', ['2026-09-20', '2026-10-10'], SOURCES[2026]),
].sort((a, b) => a.date.localeCompare(b.date));

const ITEMS_BY_DATE = new Map(CHINA_HOLIDAY_ITEMS.map(item => [item.date, item]));

export function getChinaDayDetail(date: string): ChinaHolidayItem | null {
  return ITEMS_BY_DATE.get(date) ?? null;
}

export function isChinaLegalHoliday(date: string): boolean {
  return getChinaDayDetail(date)?.type === 'holiday';
}

export function isChinaAdjustedWorkday(date: string): boolean {
  return getChinaDayDetail(date)?.type === 'workday';
}

export function listChinaHolidayItemsInRange(start: string, end: string, type?: ChinaDayType): ChinaHolidayItem[] {
  return CHINA_HOLIDAY_ITEMS.filter(item => item.date >= start && item.date <= end && (!type || item.type === type));
}

export function listChinaHolidayItemsForMonth(year: number, month: number, type?: ChinaDayType): ChinaHolidayItem[] {
  const start = dateOf(year, month, 1);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = dateOf(year, month, lastDay);
  return listChinaHolidayItemsInRange(start, end, type);
}

export function getChinaHolidayDatesForMonth(year: number, month: number): Set<string> {
  return new Set(listChinaHolidayItemsForMonth(year, month, 'holiday').map(item => item.date));
}

export function getChinaAdjustedWorkdayDatesForMonth(year: number, month: number): Set<string> {
  return new Set(listChinaHolidayItemsForMonth(year, month, 'workday').map(item => item.date));
}

function groupHolidayItems(items: ChinaHolidayItem[]): ChinaHolidayGroup[] {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const dates = groups.get(item.name) ?? [];
    dates.push(item.date);
    groups.set(item.name, dates);
  }
  return [...groups.entries()]
    .map(([name, dates]) => {
      const sorted = [...dates].sort();
      return { name, dates: sorted, startDate: sorted[0], endDate: sorted[sorted.length - 1] };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function listChinaHolidayGroupsStartingInMonth(year: number, month: number): ChinaHolidayGroup[] {
  const monthPrefix = `${year}-${pad(month)}-`;
  const items = listChinaHolidayItemsInRange(`${year}-01-01`, `${year}-12-31`, 'holiday');
  return groupHolidayItems(items).filter(group => group.startDate.startsWith(monthPrefix));
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function formatDateRange(group: ChinaHolidayGroup) {
  const startMonth = Number(group.startDate.slice(5, 7));
  const startDay = Number(group.startDate.slice(8, 10));
  const endMonth = Number(group.endDate.slice(5, 7));
  const endDay = Number(group.endDate.slice(8, 10));
  if (group.startDate === group.endDate) return `${startMonth}月${startDay}日`;
  if (startMonth === endMonth) return `${startMonth}月${startDay}-${endDay}日`;
  return `${startMonth}月${startDay}日-${endMonth}月${endDay}日`;
}

export function buildHolidayNotice(today: string): HolidayNotice | null {
  const [year, month, day] = today.split('-').map(Number);
  const target = day >= 28 ? nextMonth(year, month) : { year, month };
  if (day > 7 && day < 28) return null;

  const groups = listChinaHolidayGroupsStartingInMonth(target.year, target.month);
  if (groups.length === 0) return null;

  const scope = target.month === month ? '本月' : '下月';
  const summary = groups.map(group => `${group.name} ${formatDateRange(group)}`).join('；');
  return {
    id: `${target.year}-${pad(target.month)}-${groups.map(group => group.name).join('-')}`,
    title: `${scope}节假日提醒`,
    message: `${summary}。请按工厂实际安排确认考勤与调休。`,
    groups,
  };
}
