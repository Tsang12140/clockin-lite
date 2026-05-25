'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import type { WorkScheduleConfig } from '@/db/schema';
import {
  describeWorkSchedule,
  getRestDaysForDate,
  isBigWeek,
  todayDateString,
  type WorkScheduleMode,
} from '@/lib/workSchedule';
import { saveWorkScheduleAction } from './actions';

const WEEK_DAYS = [
  { index: 1, label: '一' },
  { index: 2, label: '二' },
  { index: 3, label: '三' },
  { index: 4, label: '四' },
  { index: 5, label: '五' },
  { index: 6, label: '六' },
  { index: 0, label: '日' },
];

const MODE_OPTIONS: Array<{
  mode: WorkScheduleMode;
  title: string;
  line: string;
}> = [
  { mode: 'single', title: '单休', line: '每周日休息' },
  { mode: 'double', title: '双休', line: '周六、周日休息' },
  { mode: 'biweekly', title: '大小周', line: '大周单休，小周双休' },
];

function restDaysText(restDays: number[]): string {
  const names = restDays
    .map(day => {
      if (day === 0) return '周日';
      if (day === 1) return '周一';
      if (day === 2) return '周二';
      if (day === 3) return '周三';
      if (day === 4) return '周四';
      if (day === 5) return '周五';
      if (day === 6) return '周六';
      return '';
    })
    .filter(Boolean);

  return names.length > 0 ? `${names.join('、')}休息` : '无固定休息日';
}

function getModeTitle(mode: WorkScheduleMode): string {
  return MODE_OPTIONS.find(option => option.mode === mode)?.title ?? '单休';
}

function WeekStrip({ restDays, dense = false }: { restDays: number[]; dense?: boolean }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {WEEK_DAYS.map(day => {
        const rested = restDays.includes(day.index);
        return (
          <span
            key={day.index}
            className={`flex ${dense ? 'h-7 text-[11px]' : 'h-8 text-[12px]'} items-center justify-center rounded-lg font-medium ${
              rested
                ? 'bg-[#FFF1F0] text-[#D83A31]'
                : 'bg-[#EEF6F2] text-[#1B7F4A]'
            }`}
          >
            {rested ? '休' : day.label}
          </span>
        );
      })}
    </div>
  );
}

function ModeCard({
  mode,
  title,
  line,
  active,
  onSelect,
}: {
  mode: WorkScheduleMode;
  title: string;
  line: string;
  active: boolean;
  onSelect: (mode: WorkScheduleMode) => void;
}) {
  const isBiweeklyMode = mode === 'biweekly';

  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
        active
          ? 'border-[#3370FF] bg-[#F7FAFF] ring-2 ring-[#3370FF]/10'
          : 'border-transparent bg-white active:bg-[#F8FAFD]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[16px] font-semibold text-gray-900">{title}</div>
          <div className="mt-0.5 text-[12px] text-gray-400">{line}</div>
        </div>
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
            active ? 'bg-[#3370FF] text-white' : 'bg-[#EEF2F7] text-transparent'
          }`}
        >
          <Check size={15} strokeWidth={2.5} />
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {isBiweeklyMode ? (
          <>
            <div className="grid grid-cols-[42px_1fr] items-center gap-2">
              <div className="text-[12px] font-medium text-gray-500">大周</div>
              <WeekStrip restDays={[0]} dense />
            </div>
            <div className="grid grid-cols-[42px_1fr] items-center gap-2">
              <div className="text-[12px] font-medium text-gray-500">小周</div>
              <WeekStrip restDays={[6, 0]} dense />
            </div>
          </>
        ) : (
          <WeekStrip restDays={mode === 'double' ? [6, 0] : [0]} />
        )}
      </div>
    </button>
  );
}

function CurrentSummary({ schedule }: { schedule: WorkScheduleConfig }) {
  const today = todayDateString();
  const restDays = getRestDaysForDate(today, schedule);
  const weekText = schedule.type === 'biweekly'
    ? `${isBigWeek(today, schedule) ? '本周大周' : '本周小周'} · `
    : '';

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="text-[12px] font-medium text-gray-400">当前制度</div>
      <div className="mt-1.5 flex flex-wrap items-end gap-x-2 gap-y-1">
        <span className="text-[20px] font-semibold leading-none text-[#1A3A8F]">
          {describeWorkSchedule(schedule)}
        </span>
        <span className="text-[13px] text-gray-500">
          {weekText}{restDaysText(restDays)}
        </span>
      </div>
      <div className="mt-3">
        <WeekStrip restDays={restDays} />
      </div>
    </div>
  );
}

function Message({ value }: { value: string }) {
  if (!value) return null;
  return (
    <div className="rounded-2xl bg-white px-4 py-3 text-[13px] leading-5 text-gray-600 shadow-sm">
      {value}
    </div>
  );
}

export default function ScheduleForm({ initialSchedule }: { initialSchedule: WorkScheduleConfig }) {
  const router = useRouter();
  const today = useMemo(() => todayDateString(), []);
  const initialCurrentIsBigWeek = initialSchedule.type === 'biweekly'
    ? isBigWeek(today, initialSchedule)
    : true;

  const [mode, setMode] = useState<WorkScheduleMode>(initialSchedule.type);
  const [currentIsBigWeek, setCurrentIsBigWeek] = useState(initialCurrentIsBigWeek);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const hasChanges = mode !== initialSchedule.type
    || (mode === 'biweekly' && currentIsBigWeek !== initialCurrentIsBigWeek);

  const chooseMode = (nextMode: WorkScheduleMode) => {
    setMode(nextMode);
    setMessage('');
    if (nextMode === 'biweekly' && initialSchedule.type === 'biweekly') {
      setCurrentIsBigWeek(initialCurrentIsBigWeek);
    }
  };

  const save = () => {
    if (!hasChanges || isPending) return;
    setMessage('');
    startTransition(async () => {
      const result = await saveWorkScheduleAction({
        mode,
        anchorDate: today,
        anchorIsBigWeek: currentIsBigWeek,
      });

      if (result.ok) {
        setMessage(result.message);
        router.refresh();
      } else {
        setMessage(result.error);
      }
    });
  };

  const saveLabel = mode === 'biweekly'
    ? `保存为大小周 · 本周${currentIsBigWeek ? '大周' : '小周'}`
    : `保存为${getModeTitle(mode)}`;

  return (
    <div className="space-y-3">
      <CurrentSummary schedule={initialSchedule} />

      <div className="grid gap-3">
        {MODE_OPTIONS.map(option => (
          <ModeCard
            key={option.mode}
            {...option}
            active={mode === option.mode}
            onSelect={chooseMode}
          />
        ))}
      </div>

      {mode === 'biweekly' && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold text-gray-800">本周按哪种周</div>
              <div className="mt-0.5 text-[12px] text-gray-400">从本周开始交替计算</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { value: true, title: '大周', desc: '本周只休周日' },
              { value: false, title: '小周', desc: '本周休周六、周日' },
            ].map(option => {
              const active = currentIsBigWeek === option.value;
              return (
                <button
                  key={option.title}
                  type="button"
                  onClick={() => {
                    setCurrentIsBigWeek(option.value);
                    setMessage('');
                  }}
                  className={`rounded-2xl border px-3 py-3 text-left transition ${
                    active
                      ? 'border-[#3370FF] bg-[#F7FAFF]'
                      : 'border-gray-100 bg-white active:bg-[#F8FAFD]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[15px] font-semibold text-gray-900">{option.title}</span>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full ${active ? 'bg-[#3370FF] text-white' : 'bg-[#EEF2F7] text-transparent'}`}>
                      <Check size={13} strokeWidth={2.5} />
                    </span>
                  </div>
                  <div className="mt-1 text-[12px] text-gray-400">{option.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={!hasChanges || isPending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#3370FF] text-[15px] font-semibold text-white shadow-sm transition disabled:bg-gray-300 disabled:text-white disabled:shadow-none"
      >
        {isPending ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
        {hasChanges ? saveLabel : '当前设置已生效'}
      </button>

      <Message value={message} />
    </div>
  );
}
