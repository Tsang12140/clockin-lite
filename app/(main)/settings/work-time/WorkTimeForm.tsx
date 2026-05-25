'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { WorkTimes } from '@/lib/tenant';
import { saveWorkTimesAction } from './actions';

export default function WorkTimeForm({ initialTimes }: { initialTimes: WorkTimes }) {
  const [startTime, setStartTime] = useState(initialTimes.startTime);
  const [endTime, setEndTime] = useState(initialTimes.endTime);
  const [lunchStartTime, setLunchStartTime] = useState(initialTimes.lunchStartTime);
  const [lunchEndTime, setLunchEndTime] = useState(initialTimes.lunchEndTime);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const save = () => {
    setMessage('');
    startTransition(async () => {
      const result = await saveWorkTimesAction({
        startTime,
        endTime,
        lunchStartTime,
        lunchEndTime,
      });
      if (result.ok) {
        setMessage(result.message);
        router.refresh();
      } else {
        setMessage(result.error);
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 text-[15px] font-semibold text-gray-800">上下班时间</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium text-gray-500">上班</span>
            <input
              type="time"
              value={startTime}
              onChange={event => setStartTime(event.target.value)}
              className="h-11 rounded-xl bg-[#F8FAFF] px-3 text-[15px] font-semibold text-[#1A3A8F] outline-none ring-1 ring-gray-100 focus:ring-[#3370FF]/30"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium text-gray-500">下班</span>
            <input
              type="time"
              value={endTime}
              onChange={event => setEndTime(event.target.value)}
              className="h-11 rounded-xl bg-[#F8FAFF] px-3 text-[15px] font-semibold text-[#1A3A8F] outline-none ring-1 ring-gray-100 focus:ring-[#3370FF]/30"
            />
          </label>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 text-[15px] font-semibold text-gray-800">午休时间</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium text-gray-500">开始</span>
            <input
              type="time"
              value={lunchStartTime}
              onChange={event => setLunchStartTime(event.target.value)}
              className="h-11 rounded-xl bg-[#F8FAFF] px-3 text-[15px] font-semibold text-[#1A3A8F] outline-none ring-1 ring-gray-100 focus:ring-[#3370FF]/30"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium text-gray-500">结束</span>
            <input
              type="time"
              value={lunchEndTime}
              onChange={event => setLunchEndTime(event.target.value)}
              className="h-11 rounded-xl bg-[#F8FAFF] px-3 text-[15px] font-semibold text-[#1A3A8F] outline-none ring-1 ring-gray-100 focus:ring-[#3370FF]/30"
            />
          </label>
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#3370FF] text-[15px] font-semibold text-white shadow-sm disabled:opacity-60"
      >
        {isPending && <Loader2 size={16} className="animate-spin" />}
        {isPending ? '保存中...' : '保存工作时间'}
      </button>

      {message && (
        <div className="rounded-2xl bg-white px-4 py-3 text-center text-[13px] font-medium text-gray-500 shadow-sm">
          {message}
        </div>
      )}
    </div>
  );
}
