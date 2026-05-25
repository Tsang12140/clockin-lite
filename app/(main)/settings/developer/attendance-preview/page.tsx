'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ChevronLeft, ChevronUp, Lock } from 'lucide-react';
import { playCompletionSound, primeCompletionSound } from '@/lib/completionSound';

type Status = 'worked' | 'leave' | 'holiday' | 'sick' | 'absent';
type PreviewRow = { id: number; name: string; hours: string; status: Status };
type PreviewMode = 'editing' | 'saving' | 'saved';

const AUTO_REST_MINUTES = 20 * 60 + 30;
const REST_CARRY_END_MINUTES = 7 * 60 + 30;

const STATUS_OPTIONS: Array<{ value: Status; label: string }> = [
  { value: 'worked', label: '正常' },
  { value: 'leave', label: '请假' },
  { value: 'holiday', label: '放假' },
  { value: 'sick', label: '病假' },
  { value: 'absent', label: '旷工' },
];

const STATUS_BADGE: Record<Status, { text: string; cls: string }> = {
  worked:  { text: '正常', cls: 'text-[#3370FF] bg-blue-50' },
  leave:   { text: '请假', cls: 'text-orange-500 bg-orange-50' },
  holiday: { text: '放假', cls: 'text-green-600 bg-green-50' },
  sick:    { text: '病假', cls: 'text-rose-500 bg-rose-50' },
  absent:  { text: '旷工', cls: 'text-red-500 bg-red-50' },
};

const INITIAL_ROWS: PreviewRow[] = [
  { id: 1, name: '林一鸣', hours: '9.0', status: 'worked' },
  { id: 2, name: '何二朗', hours: '9.0', status: 'worked' },
  { id: 3, name: '苏强', hours: '8.0', status: 'worked' },
  { id: 4, name: '周良清', hours: '8.0', status: 'worked' },
];

const FONT_STEPS = [
  { zoom: 1,    name: '15px', value: '18px', input: '16px', status: '13px', button: '32px', buttonText: '18px', valueWidth: '48px', statusWidth: '74px', gap: '10px' },
  { zoom: 1.08, name: '15px', value: '18px', input: '16px', status: '13px', button: '31px', buttonText: '18px', valueWidth: '46px', statusWidth: '72px', gap: '7px' },
  { zoom: 1.16, name: '15px', value: '18px', input: '16px', status: '13px', button: '30px', buttonText: '18px', valueWidth: '44px', statusWidth: '70px', gap: '5px' },
  { zoom: 1.24, name: '15px', value: '18px', input: '16px', status: '13px', button: '29px', buttonText: '18px', valueWidth: '42px', statusWidth: '68px', gap: '4px' },
];

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function mergeDatePart(current: Date, value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const next = new Date(current);
  next.setFullYear(year, month - 1, day);
  return next;
}

function addMinutes(current: Date, delta: number) {
  const next = new Date(current);
  next.setHours(0, minutesOfDay(current) + delta, 0, 0);
  return next;
}

function isSunday(date: Date) {
  return date.getDay() === 0;
}

function minutesOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

export default function AttendanceCardPreviewPage() {
  const [rows, setRows] = useState(INITIAL_ROWS);
  const [fontLevel, setFontLevel] = useState(0);
  const [waveId, setWaveId] = useState(0);
  const [mode, setMode] = useState<PreviewMode>('editing');
  const [completionStep, setCompletionStep] = useState(-1);
  const [sandboxNow, setSandboxNow] = useState(() => new Date());
  const timersRef = useRef<number[]>([]);

  const clearPreviewTimers = () => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
  };

  useEffect(() => {
    const readFontLevel = () => {
      const next = Number.parseInt(localStorage.getItem('clockin_fontsize') ?? '0', 10);
      setFontLevel(Number.isFinite(next) ? next : 0);
    };
    readFontLevel();
    window.addEventListener('focus', readFontLevel);
    window.addEventListener('pageshow', readFontLevel);
    return () => {
      window.removeEventListener('focus', readFontLevel);
      window.removeEventListener('pageshow', readFontLevel);
      clearPreviewTimers();
    };
  }, []);

  const fontSteps = FONT_STEPS[fontLevel] ?? FONT_STEPS[0];
  const sandboxMinutes = minutesOfDay(sandboxNow);
  const sandboxIsSunday = isSunday(sandboxNow);
  const sandboxWillAutoRest = sandboxIsSunday && mode === 'editing' && sandboxMinutes >= AUTO_REST_MINUTES;
  const noticePill = (() => {
    if (mode === 'saving') return { text: '保存中', cls: 'text-[#3370FF] bg-blue-50' };
    if (mode === 'saved') return { text: '✓ 今天已录入', cls: 'text-green-600 bg-green-50' };
    if (sandboxIsSunday) return { text: '好好休息', cls: 'text-gray-400 bg-gray-100' };
    if (sandboxMinutes >= 18 * 60) return { text: '请录入工时！', cls: 'text-amber-600 bg-amber-50 border border-amber-200' };
    if (sandboxMinutes >= 9 * 60) return { text: '还没下班哦', cls: 'text-gray-400 bg-gray-100' };
    if (sandboxMinutes >= REST_CARRY_END_MINUTES) return { text: '准备开工', cls: 'text-gray-400 bg-gray-100' };
    return { text: '好好休息', cls: 'text-gray-400 bg-gray-100' };
  })();
  const sandboxWeekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][sandboxNow.getDay()];
  const attendanceFontStyle = {
    '--att-zoom':             String(fontSteps.zoom),
    '--att-name-size':        fontSteps.name,
    '--att-value-size':       fontSteps.value,
    '--att-input-size':       fontSteps.input,
    '--att-status-size':      fontSteps.status,
    '--att-button-size':      fontSteps.button,
    '--att-button-text-size': fontSteps.buttonText,
    '--att-value-width':      fontSteps.valueWidth,
    '--att-status-width':     fontSteps.statusWidth,
    '--att-row-gap':          fontSteps.gap,
    zoom:                     fontSteps.zoom,
  } as CSSProperties & { zoom: number };

  const patchRow = (id: number, patch: Partial<PreviewRow>) => {
    setRows(prev => prev.map(row => row.id === id ? { ...row, ...patch } : row));
  };

  const adjustHours = (id: number, delta: number) => {
    setRows(prev => prev.map(row => {
      if (row.id !== id || row.status !== 'worked' || mode !== 'editing') return row;
      const next = Math.max(0, Math.min(24, (parseFloat(row.hours) || 0) + delta));
      return { ...row, hours: next % 1 === 0 ? next.toFixed(0) : next.toFixed(1) };
    }));
  };

  const handleSave = () => {
    clearPreviewTimers();
    primeCompletionSound();
    setWaveId(id => id + 1);
    setMode('saving');
    setCompletionStep(-1);
    rows.forEach((_, index) => {
      timersRef.current.push(window.setTimeout(() => {
        setCompletionStep(index);
      }, 90 + index * 300));
    });
    timersRef.current.push(window.setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(18);
      playCompletionSound();
      setMode('saved');
      setCompletionStep(rows.length - 1);
    }, 90 + Math.max(0, rows.length - 1) * 300 + 860));
  };

  const handleModify = () => {
    clearPreviewTimers();
    setMode('editing');
    setCompletionStep(-1);
  };

  const handleReset = () => {
    clearPreviewTimers();
    setRows(INITIAL_ROWS);
    setMode('editing');
    setCompletionStep(-1);
    setWaveId(id => id + 1);
  };

  const adjustSandboxTime = (deltaMinutes: number) => {
    setSandboxNow(current => addMinutes(current, deltaMinutes));
  };

  return (
    <div className="min-h-screen bg-[#F0F4FA] pb-24 overflow-x-hidden">
      <div className="max-w-2xl mx-auto md:px-6 md:py-5">
        <div className="bg-white shadow-sm px-4 pt-5 pb-4 flex items-center md:rounded-2xl">
          <Link href="/settings/developer" className="p-1 mr-3 text-gray-400">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-[17px] font-semibold text-[#1A3A8F]">考勤卡片预览</h1>
        </div>

        <div className="mx-3 mt-3 rounded-2xl bg-white px-4 py-3 shadow-sm md:mx-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-[14px] font-semibold text-gray-700">本地时间沙盒</div>
              <div className="mt-0.5 text-[12px] text-gray-400">只影响本预览页，刷新后还原</div>
            </div>
            <button
              type="button"
              onClick={() => setSandboxNow(new Date())}
              className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-500"
            >
              回到现在
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_178px]">
            <input
              type="date"
              value={toDateInputValue(sandboxNow)}
              onChange={event => setSandboxNow(current => mergeDatePart(current, event.target.value))}
              className="h-10 min-w-0 rounded-xl border border-[#DDE6F3] bg-[#F8FAFF] px-3 text-[14px] font-semibold text-gray-700 outline-none focus:border-[#3370FF]"
            />
            <div
              className="grid h-14 min-w-0 grid-cols-[1fr_1fr] overflow-hidden rounded-xl border border-[#DDE6F3] bg-[#F8FAFF]"
              aria-label="选定时间"
            >
              <div className="grid grid-cols-[34px_1fr] border-r border-[#E6EDF8]">
                <div className="grid grid-rows-2 border-r border-[#E6EDF8]">
                  <button
                    type="button"
                    onClick={() => adjustSandboxTime(60)}
                    className="flex items-center justify-center text-gray-400 active:bg-blue-50 active:text-[#3370FF]"
                    aria-label="小时增加"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustSandboxTime(-60)}
                    className="flex items-center justify-center text-gray-400 active:bg-blue-50 active:text-[#3370FF]"
                    aria-label="小时减少"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
                <div className="flex items-center justify-center gap-0.5">
                  <span className="text-[18px] font-semibold text-[#1A3A8F]">{pad2(sandboxNow.getHours())}</span>
                  <span className="text-[11px] font-medium text-gray-400">时</span>
                </div>
              </div>
              <div className="grid grid-cols-[34px_1fr]">
                <div className="grid grid-rows-2 border-r border-[#E6EDF8]">
                  <button
                    type="button"
                    onClick={() => adjustSandboxTime(5)}
                    className="flex items-center justify-center text-gray-400 active:bg-blue-50 active:text-[#3370FF]"
                    aria-label="分钟增加"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustSandboxTime(-5)}
                    className="flex items-center justify-center text-gray-400 active:bg-blue-50 active:text-[#3370FF]"
                    aria-label="分钟减少"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
                <div className="flex items-center justify-center gap-0.5">
                  <span className="text-[18px] font-semibold text-[#1A3A8F]">{pad2(sandboxNow.getMinutes())}</span>
                  <span className="text-[11px] font-medium text-gray-400">分</span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[12px] font-medium text-gray-400">
              {sandboxWeekday} {sandboxWillAutoRest ? '20:30 后会触发自动休息' : sandboxIsSunday ? '周日默认休息' : '工作日规则'}
            </span>
            <span className={`whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-semibold ${noticePill.cls}`}>
              {noticePill.text}
            </span>
          </div>
        </div>

        <div className="px-3 pt-3 overflow-x-hidden md:px-0">
          <div className="space-y-2 origin-top-left" style={attendanceFontStyle}>
            {rows.map((row, index) => {
            const isWork = row.status === 'worked';
            const badge = STATUS_BADGE[row.status];
            const cardBg = index % 2 === 0 ? 'bg-white' : 'bg-[#F4F7FF]';
            const isCompleted = mode === 'saved' || (mode === 'saving' && index <= completionStep);
            const isEditing = mode === 'editing';
            const showCheck = mode === 'saving' && index <= completionStep;

            return (
                <div key={row.id} className={`${cardBg} rounded-2xl shadow-sm p-3`}>
                <div className="grid grid-cols-[minmax(56px,1fr)_auto_var(--att-status-width)_22px] items-center gap-[var(--att-row-gap)]">
                  <div className="min-w-0">
                    <span className={`${row.name.length === 2 ? 'inline-block w-[3em] text-justify [text-align-last:justify]' : 'block truncate'} text-[var(--att-name-size)] font-semibold text-gray-800`}>{row.name}</span>
                  </div>

                  <div className="grid grid-cols-[var(--att-button-size)_var(--att-value-width)_var(--att-button-size)] items-center justify-items-center shrink-0">
                    <button onClick={() => adjustHours(row.id, -0.5)} disabled={!isWork || !isEditing}
                      className={`w-[var(--att-button-size)] h-[var(--att-button-size)] rounded-full font-bold text-[var(--att-button-text-size)] flex items-center justify-center transition-colors
                        ${!isWork || isCompleted ? 'bg-gray-50 text-gray-200' : 'bg-[#E8EEF8] text-[#1A3A8F]'}`}>−</button>

                    {isCompleted ? (
                      <span className="w-[var(--att-value-width)] text-center text-[var(--att-value-size)] font-bold text-[#1A3A8F]">
                        {isWork && row.hours ? row.hours : '—'}
                      </span>
                    ) : (
                      <input type="text" inputMode="decimal"
                        value={isWork ? row.hours : ''} disabled={!isWork || !isEditing}
                        onChange={e => patchRow(row.id, { hours: e.target.value })}
                        className="w-full p-0 text-center text-[var(--att-input-size)] font-bold text-[#1A3A8F] border-0 bg-transparent focus:outline-none disabled:text-gray-300"
                        placeholder="—" />
                    )}

                    <button onClick={() => adjustHours(row.id, 0.5)} disabled={!isWork || !isEditing}
                      className={`w-[var(--att-button-size)] h-[var(--att-button-size)] rounded-full font-bold text-[var(--att-button-text-size)] flex items-center justify-center transition-colors
                        ${!isWork || isCompleted ? 'bg-gray-50 text-gray-200' : 'bg-[#E8EEF8] text-[#1A3A8F]'}`}>＋</button>
                  </div>

                  <div className="min-w-max flex items-center justify-end">
                    {isCompleted ? (
                      <span className={`whitespace-nowrap text-[var(--att-status-size)] font-semibold px-2.5 py-1 rounded-lg ${badge.cls}`}>{badge.text}</span>
                    ) : (
                      <select value={row.status} onChange={e => patchRow(row.id, { status: e.target.value as Status })}
                        className="w-[var(--att-status-width)] shrink-0 whitespace-nowrap text-[var(--att-status-size)] text-gray-600 bg-[#F0F4FA] border-0 rounded-lg px-1.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#3370FF]">
                        {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    )}
                  </div>

                  <span className="w-[22px] h-[22px] shrink-0 flex items-center justify-center">
                    {showCheck ? (
                      <span
                        key={`${waveId}-${row.id}`}
                        className="completion-wave-check"
                      >
                        <Check size={14} strokeWidth={3.2} />
                      </span>
                    ) : isCompleted ? (
                      <Lock size={12} className="text-gray-200" />
                    ) : (
                      <Lock size={12} className="text-gray-200" />
                    )}
                  </span>
                </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <button onClick={handleReset}
              className="h-9 px-3 bg-white border border-gray-200 text-gray-500 text-[13px] font-medium rounded-xl shadow-sm">
              重置
            </button>
          </div>
          <span className={`whitespace-nowrap text-[13px] font-semibold px-4 py-1.5 rounded-full ${noticePill.cls}`}>
            {noticePill.text}
          </span>
          <div className="flex justify-end">
            <button onClick={mode === 'saved' ? handleModify : handleSave}
              disabled={mode === 'saving'}
              className={`h-9 px-6 text-[14px] font-semibold rounded-xl shadow-sm disabled:opacity-60
                ${mode === 'saved' ? 'bg-white border border-gray-200 text-gray-600' : 'bg-[#3370FF] text-white'}`}>
              {mode === 'saved' ? '修改' : mode === 'saving' ? '…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
