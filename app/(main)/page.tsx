import { getActiveEmployees, getAttendanceForRange, getLastWorkedHours, getMonthAdjustedWorkdayDates, getMonthHolidayDates } from '@/lib/queries';

import TodayEntry from './TodayEntry';
import DesktopView from './DesktopView';
import HolidayNotice from './HolidayNotice';
import { todayString, getMonday, addDays } from '@/lib/utils';
import { fetchWeatherSnapshot } from '@/lib/weatherServer';
import { getWorkSchedule, getWorkTimes, getWeatherCity } from '@/lib/tenant';
import { isWorkday as isScheduledWorkday, normalizeWorkSchedule } from '@/lib/workSchedule';
import { buildHolidayNotice } from '@/lib/chinaHolidays';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const today     = todayString();
  const weekStart = getMonday(today);
  const weekEnd   = addDays(weekStart, 6);

  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endOfMonth = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

  const [employees, monthRecs, lastWorkedHours, weatherSnapshot, holidayDates, adjustedWorkdayDates, workScheduleConfig, workTimes, weatherCity] = await Promise.all([
    getActiveEmployees(),
    getAttendanceForRange(startOfMonth, endOfMonth),
    getLastWorkedHours(),
    fetchWeatherSnapshot(),
    getMonthHolidayDates(year, month),
    getMonthAdjustedWorkdayDates(year, month),
    getWorkSchedule(),
    getWorkTimes(),
    getWeatherCity(),
  ]);
  const workEndHour = workTimes.endTime ? parseInt(workTimes.endTime.split(':')[0], 10) : 15;
  const workSchedule = normalizeWorkSchedule(workScheduleConfig);
  const holidayNotice = buildHolidayNotice(today);
  // Week data is a subset of month data — no second DB query needed
  const weekRecs = monthRecs.filter(r => r.workDate != null && r.workDate >= weekStart && r.workDate <= weekEnd);

  // Compute most recent unrecorded workday this month.
  const yesterday = addDays(today, -1);
  let missedDate: string | null = null;
  if (yesterday >= startOfMonth) {
    const datesWithRecs = new Set(
      monthRecs.map(r => r.workDate).filter((d): d is string => d !== null)
    );
    let check = yesterday;
    while (check >= startOfMonth) {
      const isWorkday = isScheduledWorkday(check, workSchedule, holidayDates, adjustedWorkdayDates);
      if (isWorkday && !datesWithRecs.has(check)) { missedDate = check; break; }
      check = addDays(check, -1);
    }
  }

  const shapeRec = (r: typeof monthRecs[0]) => ({
    employeeId:  r.employeeId,
    workDate:    r.workDate,
    hours:       r.hours,
    status:      r.status,
    statusLabel: r.statusLabel,
    isLocked:    r.isLocked,
  });

  const commonProps = {
    employees,
    today,
    missedDate,
    lastWorkedHours,
    weatherSnapshot,
    weatherCity,
    workSchedule,
    workEndHour,
  };

  return (
    <>
      <HolidayNotice notice={holidayNotice} />

      {/* Mobile view */}
      <div className="lg:hidden">
        <TodayEntry
          {...commonProps}
          initialAttendance={weekRecs.map(shapeRec)}
          initialWeekStart={weekStart}
        />
      </div>

      {/* Desktop view */}
      <div className="hidden lg:block">
        <DesktopView
          {...commonProps}
          initialMonthData={monthRecs.map(shapeRec)}
          initialYear={year}
          initialMonth={month}
        />
      </div>
    </>
  );
}
