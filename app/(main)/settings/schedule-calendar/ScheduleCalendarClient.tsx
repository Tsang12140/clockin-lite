'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { saveScheduleCalendarDay } from './actions';

type DayItem = {
  date: string;
  day: number;
  weekday: number;
  isToday: boolean;
  builtInHolidayName: string | null;
  builtInHoliday: boolean;
  builtInWorkday: boolean;
  overrideType: 'factory_holiday' | 'workday' | null;
};

function statusText(day: DayItem) {
  if (day.overrideType === 'factory_holiday') return '休';
  if (day.overrideType === 'workday') return '班';
  if (day.builtInHoliday) return '休';
  if (day.builtInWorkday) return '班';
  return '';
}

function statusClass(day: DayItem, selected: boolean) {
  if (selected) return 'bg-[#3370FF] text-white shadow-sm';
  if (day.overrideType === 'factory_holiday') return 'bg-green-50 text-green-700 ring-1 ring-green-100';
  if (day.overrideType === 'workday') return 'bg-blue-50 text-[#3370FF] ring-1 ring-blue-100';
  if (day.builtInHoliday) return 'bg-amber-50 text-amber-700';
  if (day.builtInWorkday) return 'bg-indigo-50 text-indigo-600';
  return 'bg-white text-gray-700 hover:bg-[#F8FAFF]';
}

export default function ScheduleCalendarClient({
  year,
  month,
  days,
}: {
  year: number;
  month: number;
  days: DayItem[];
}) {
  const [selectedDate, setSelectedDate] = useState(days.find(day => day.isToday)?.date ?? days[0]?.date ?? '');
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const selected = days.find(day => day.date === selectedDate) ?? days[0];
  const firstOffset = days[0] ? (days[0].weekday + 6) % 7 : 0;
  const prev = useMemo(() => {
    const date = new Date(year, month - 2, 1);
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  }, [year, month]);
  const next = useMemo(() => {
    const date = new Date(year, month, 1);
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  }, [year, month]);

  const save = (type: 'factory_holiday' | 'workday' | 'default') => {
    if (!selected) return;
    setMessage('');
    const formData = new FormData();
    formData.set('date', selected.date);
    formData.set('type', type);
    startTransition(async () => {
      const result = await saveScheduleCalendarDay(formData);
      if (result.ok) {
        setMessage('已保存排班日历。');
        router.refresh();
      } else {
        setMessage(result.error);
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href={`/settings/schedule-calendar?year=${prev.year}&month=${prev.month}`}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F0F4FA] text-gray-500"
            aria-label="上个月"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="text-[19px] font-bold text-[#1A3A8F]">{year}年{month}月</div>
          <Link
            href={`/settings/schedule-calendar?year=${next.year}&month=${next.month}`}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F0F4FA] text-gray-500"
            aria-label="下个月"
          >
            <ChevronRight size={18} />
          </Link>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[12px] font-semibold text-gray-400">
          {['一', '二', '三', '四', '五', '六', '日'].map(item => <div key={item} className="py-1">{item}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstOffset }, (_, index) => <div key={`blank-${index}`} className="h-16" />)}
          {days.map(day => {
            const selected = day.date === selectedDate;
            const text = statusText(day);
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedDate(day.date)}
                className={`flex h-16 min-w-0 flex-col items-center justify-center rounded-xl px-1 transition ${statusClass(day, selected)}`}
              >
                <span className="text-[17px] font-bold leading-none">{day.day}</span>
                <span className={`mt-1 min-h-4 max-w-full truncate text-[10px] leading-4 ${selected ? 'text-white/85' : 'text-current opacity-75'}`}>
                  {text}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-[13px] font-semibold text-gray-500">当前选择</div>
          <div className="mt-1 text-[18px] font-bold text-[#1A3A8F]">
            {selected.date.slice(5).replace('-', '月')}日
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => save('factory_holiday')}
              className="h-10 rounded-xl bg-green-50 text-[13px] font-semibold text-green-700 disabled:opacity-60"
            >
              设为休
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => save('workday')}
              className="h-10 rounded-xl bg-blue-50 text-[13px] font-semibold text-[#3370FF] disabled:opacity-60"
            >
              设为班
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => save('default')}
              className="flex h-10 items-center justify-center gap-1 rounded-xl bg-[#F0F4FA] text-[13px] font-semibold text-gray-500 disabled:opacity-60"
            >
              <RotateCcw size={14} />
              按默认
            </button>
          </div>
          {message && (
            <div className={`mt-3 rounded-xl px-3 py-2.5 text-[12px] ${message.startsWith('已保存') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {message}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
