'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import type { HolidayNotice as HolidayNoticeData } from '@/lib/chinaHolidays';

export default function HolidayNotice({ notice }: { notice: HolidayNoticeData | null }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!notice) return;
    setDismissed(localStorage.getItem(`clockin_holiday_notice_${notice.id}`) === '1');
  }, [notice]);

  if (!notice || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(`clockin_holiday_notice_${notice.id}`, '1');
    setDismissed(true);
  };

  return (
    <div className="bg-[#FFF7E8] px-3 py-2 md:bg-transparent md:px-6 md:pt-5">
      <div className="mx-auto flex max-w-7xl items-center gap-2 rounded-2xl border border-amber-100 bg-white px-3 py-2.5 text-left shadow-sm md:px-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
          <CalendarDays size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-amber-700">{notice.title}</div>
          <div className="mt-0.5 truncate text-[12px] text-amber-600 md:whitespace-normal">{notice.message}</div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-amber-400 hover:bg-amber-50"
          aria-label="确认并关闭"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
