'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Lock } from 'lucide-react';

export interface DesktopAttendanceEmployee {
  id: number;
  name: string;
}

export interface DesktopAttendanceRow {
  hours: string;
  status: string;
  customLabel: string;
}

export const DESKTOP_STATUS_OPTIONS = [
  { value: 'worked',      label: '正常' },
  { value: 'leave',       label: '请假' },
  { value: 'holiday',     label: '放假' },
  { value: 'sick',        label: '病假' },
  { value: 'absent',      label: '旷工' },
  { value: 'custom',      label: '自定义' },
  { value: 'all_holiday', label: '全体放假' },
];

export const DESKTOP_STATUS_BADGE: Record<string, { text: string; cls: string }> = {
  worked:  { text: '正常', cls: 'text-[#3370FF] bg-blue-50' },
  leave:   { text: '请假', cls: 'text-orange-500 bg-orange-50' },
  holiday: { text: '放假', cls: 'text-green-600 bg-green-50' },
  sick:    { text: '病假', cls: 'text-rose-500 bg-rose-50' },
  absent:  { text: '旷工', cls: 'text-red-600 bg-red-50' },
};

export function formatDesktopHours(hours: string | null) {
  if (!hours) return '';
  const n = parseFloat(hours);
  return Number.isFinite(n) ? n.toFixed(1) : '';
}

export default function DesktopAttendanceEditor({
  employees,
  rows,
  locked,
  completionActive = false,
  completionStep = -1,
  onAdjustHours,
  onSetHours,
  onNormalizeHours,
  onSetStatus,
  onSetCustomLabel,
}: {
  employees: DesktopAttendanceEmployee[];
  rows: Record<number, DesktopAttendanceRow>;
  locked: boolean;
  completionActive?: boolean;
  completionStep?: number;
  onAdjustHours: (employeeId: number, delta: number) => void;
  onSetHours: (employeeId: number, value: string) => void;
  onNormalizeHours: (employeeId: number) => void;
  onSetStatus: (employeeId: number, status: string) => void;
  onSetCustomLabel: (employeeId: number, value: string) => void;
}) {
  const [openStatusMenu, setOpenStatusMenu] = useState<number | null>(null);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (openStatusMenu === null) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!statusMenuRef.current?.contains(event.target as Node)) {
        setOpenStatusMenu(null);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [openStatusMenu]);

  useEffect(() => {
    const timer = window.setTimeout(() => setOpenStatusMenu(null), 0);
    return () => window.clearTimeout(timer);
  }, [locked]);

  const selectStatus = (employeeId: number, status: string) => {
    setOpenStatusMenu(null);
    onSetStatus(employeeId, status);
  };

  return (
    <div className="overflow-visible rounded-xl border border-gray-100 bg-white">
      <div className="grid grid-cols-[minmax(160px,1fr)_280px_220px_42px] items-center gap-4 rounded-t-xl bg-[#F8FAFF] px-5 py-3 text-[13px] font-semibold text-gray-500">
        <div>姓名</div>
        <div className="text-center">工时</div>
        <div>状态</div>
        <div />
      </div>
      <div className="divide-y divide-gray-100">
        {employees.map((emp, empIdx) => {
          const row = rows[emp.id] ?? { hours: '8.0', status: 'worked', customLabel: '' };
          const isWork = row.status === 'worked';
          const isCustom = row.status === 'custom';
          const badge = DESKTOP_STATUS_BADGE[row.status];
          const rowBg = empIdx % 2 === 0 ? 'bg-white' : 'bg-[#F6F8FF]';
          const rowCompleted = locked && (!completionActive || empIdx <= completionStep);
          const showCheck = locked && completionActive && empIdx <= completionStep;

          return (
            <div
              key={emp.id}
              className={`grid grid-cols-[minmax(160px,1fr)_280px_220px_42px] items-center gap-4 px-5 py-4 ${rowBg} ${empIdx === employees.length - 1 ? 'rounded-b-xl' : ''}`}
            >
              <div className="min-w-0 pr-4">
                <span className={`${emp.name.length === 2 ? 'inline-block w-[3em] text-justify [text-align-last:justify]' : 'block truncate'} select-text text-[19px] font-bold text-gray-800`}>{emp.name}</span>
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => onAdjustHours(emp.id, -0.5)}
                  disabled={!isWork || locked}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-[20px] font-bold transition-colors
                    ${!isWork || rowCompleted ? 'bg-gray-50 text-gray-200' : 'bg-[#E8EEF8] text-[#1A3A8F] hover:bg-[#D8E6FF]'}`}
                >
                  -
                </button>
                {rowCompleted ? (
                  <span className="w-20 text-center text-[24px] font-bold leading-none text-[#1A3A8F]">
                    {isWork && row.hours ? formatDesktopHours(row.hours) : '-'}
                  </span>
                ) : (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={isWork ? row.hours : ''}
                    disabled={!isWork}
                    readOnly={locked}
                    onChange={e => onSetHours(emp.id, e.target.value)}
                    onBlur={() => onNormalizeHours(emp.id)}
                    className="h-10 w-20 rounded-lg border border-transparent bg-transparent text-center text-[22px] font-bold leading-none text-[#1A3A8F] focus:outline-none focus:ring-2 focus:ring-[#3370FF]/20 disabled:text-gray-300"
                  />
                )}
                <button
                  onClick={() => onAdjustHours(emp.id, 0.5)}
                  disabled={!isWork || locked}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-[20px] font-bold transition-colors
                    ${!isWork || rowCompleted ? 'bg-gray-50 text-gray-200' : 'bg-[#E8EEF8] text-[#1A3A8F] hover:bg-[#D8E6FF]'}`}
                >
                  +
                </button>
              </div>

              <div>
                {rowCompleted ? (
                  isCustom ? (
                    <span className="inline-flex h-10 items-center rounded-xl border border-purple-100 bg-purple-50 px-3 text-[14px] font-semibold text-purple-500">
                      {row.customLabel || '自定义'}
                    </span>
                  ) : badge ? (
                    <span className={`inline-flex h-10 items-center rounded-xl px-3 text-[14px] font-semibold ${badge.cls}`}>{badge.text}</span>
                  ) : null
                ) : isCustom ? (
                  <div className="flex w-48 items-center gap-2">
                    <input
                      type="text"
                      maxLength={4}
                      value={row.customLabel}
                      placeholder="自定义"
                      readOnly={locked}
                      onChange={e => onSetCustomLabel(emp.id, e.target.value)}
                      className="h-10 min-w-0 flex-1 rounded-xl border border-[#DDE6F3] bg-white px-3 text-[14px] font-semibold text-gray-700 outline-none transition placeholder:text-gray-300 focus:border-[#3370FF] focus:ring-2 focus:ring-[#3370FF]/15"
                    />
                    <button
                      onClick={() => selectStatus(emp.id, 'worked')}
                      disabled={locked}
                      className="h-10 w-10 rounded-xl border border-gray-100 bg-white text-[18px] font-semibold text-gray-300 transition hover:bg-gray-50 hover:text-gray-500 disabled:opacity-40"
                    >
                      x
                    </button>
                  </div>
                ) : (
                  <div ref={openStatusMenu === emp.id ? statusMenuRef : null} className="relative w-32">
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => setOpenStatusMenu(current => current === emp.id ? null : emp.id)}
                      className="flex h-10 w-full items-center justify-between rounded-xl border border-[#DDE6F3] bg-[#F8FAFF] px-3 text-[14px] font-semibold text-gray-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:border-[#BFD1EC] focus:outline-none focus:ring-2 focus:ring-[#3370FF]/15 disabled:opacity-60"
                    >
                      <span>{DESKTOP_STATUS_OPTIONS.find(option => option.value === row.status)?.label ?? '正常'}</span>
                      <ChevronDown size={16} className={`text-gray-400 transition-transform ${openStatusMenu === emp.id ? 'rotate-180' : ''}`} />
                    </button>
                    {openStatusMenu === emp.id && (
                      <div className="absolute left-0 top-11 z-50 w-40 overflow-hidden rounded-xl border border-[#DDE6F3] bg-white py-1 shadow-lg shadow-slate-200/80">
                        {DESKTOP_STATUS_OPTIONS.map(option => {
                          const isActive = option.value === row.status;
                          const isGlobalAction = option.value === 'all_holiday';
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => selectStatus(emp.id, option.value)}
                              className={`flex h-9 w-full items-center justify-between px-3 text-left text-[14px] font-semibold transition
                                ${isGlobalAction ? 'mt-1 border-t border-gray-100 text-amber-600' : 'text-gray-700'}
                                ${isActive ? 'bg-blue-50 text-[#3370FF]' : 'hover:bg-[#F8FAFF]'}`}
                            >
                              <span>{option.label}</span>
                              {isActive && <span className="h-1.5 w-1.5 rounded-full bg-[#3370FF]" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                {rowCompleted && (
                  showCheck ? (
                    <span className="completion-wave-check">
                      <Check size={14} strokeWidth={3.2} />
                    </span>
                  ) : (
                    <Lock size={14} className="text-gray-200" />
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
