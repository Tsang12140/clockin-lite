import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { listChinaHolidayItemsForMonth } from '@/lib/chinaHolidays';
import { listScheduleOverridesForMonth } from '@/lib/scheduleOverrides';
import ScheduleCalendarClient from './ScheduleCalendarClient';

export const dynamic = 'force-dynamic';

function safeYear(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : new Date().getFullYear();
}

function safeMonth(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : new Date().getMonth() + 1;
}

export default async function ScheduleCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const year = safeYear(params.year);
  const month = safeMonth(params.month);
  const lastDay = new Date(year, month, 0).getDate();
  const [overrides, holidayItems, workdayItems] = await Promise.all([
    listScheduleOverridesForMonth(year, month),
    Promise.resolve(listChinaHolidayItemsForMonth(year, month, 'holiday')),
    Promise.resolve(listChinaHolidayItemsForMonth(year, month, 'workday')),
  ]);
  const overrideMap = new Map(overrides.map(item => [item.date, item]));
  const holidayMap = new Map(holidayItems.map(item => [item.date, item]));
  const workdaySet = new Set(workdayItems.map(item => item.date));
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const days = Array.from({ length: lastDay }, (_, index) => {
    const day = index + 1;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const builtInHoliday = holidayMap.get(date) ?? null;
    const override = overrideMap.get(date) ?? null;
    return {
      date,
      day,
      weekday: new Date(`${date}T00:00:00`).getDay(),
      isToday: date === todayString,
      builtInHolidayName: builtInHoliday?.name ?? null,
      builtInHoliday: Boolean(builtInHoliday),
      builtInWorkday: workdaySet.has(date),
      overrideType: override?.type ?? null,
    };
  });

  return (
    <div className="min-h-screen bg-[#F0F4FA]">
      <div className="mx-auto max-w-2xl md:px-6 md:py-5">
        <div className="flex items-center gap-3 bg-white px-4 pb-4 pt-5 shadow-sm md:rounded-2xl">
          <Link
            href="/settings"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F0F4FA] text-gray-500"
            aria-label="返回设置"
          >
            <ChevronLeft size={18} />
          </Link>
          <div>
            <h1 className="text-[17px] font-semibold text-[#1A3A8F]">排班日历</h1>
            <div className="mt-0.5 text-[12px] text-gray-400">按月调整厂休日和调休上班</div>
          </div>
        </div>

        <div className="mt-3 px-3 pb-6 md:px-0">
          <ScheduleCalendarClient year={year} month={month} days={days} />
        </div>
      </div>
    </div>
  );
}
