'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import DesktopAttendanceEditor, {
  type DesktopAttendanceRow,
  formatDesktopHours,
} from '@/app/(main)/DesktopAttendanceEditor';

const PREVIEW_EMPLOYEES = [
  { id: 1, name: '林一鸣' },
  { id: 2, name: '何二朗' },
  { id: 3, name: '苏强' },
  { id: 4, name: '周良清' },
];

const INITIAL_ROWS: Record<number, DesktopAttendanceRow> = {
  1: { hours: '9.0', status: 'worked', customLabel: '' },
  2: { hours: '9.0', status: 'worked', customLabel: '' },
  3: { hours: '8.0', status: 'worked', customLabel: '' },
  4: { hours: '8.0', status: 'worked', customLabel: '' },
};

type PreviewMode = 'editing' | 'saving' | 'saved';

export default function DesktopAttendancePreviewPage() {
  const [rows, setRows] = useState(INITIAL_ROWS);
  const [mode, setMode] = useState<PreviewMode>('editing');
  const [completionStep, setCompletionStep] = useState(-1);
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
  };

  useEffect(() => clearTimers, []);

  const updateRow = (id: number, patch: Partial<DesktopAttendanceRow>) => {
    setRows(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const adjustHours = (id: number, delta: number) => {
    if (mode !== 'editing') return;
    setRows(prev => {
      const row = prev[id] ?? { hours: '8.0', status: 'worked', customLabel: '' };
      if (row.status !== 'worked') return prev;
      const next = Math.max(0, Math.min(24, parseFloat(((parseFloat(row.hours || '0')) + delta).toFixed(1))));
      return { ...prev, [id]: { ...row, hours: next.toFixed(1) } };
    });
  };

  const setStatus = (id: number, status: string) => {
    if (mode !== 'editing') return;
    if (status === 'all_holiday') {
      setRows(prev => Object.fromEntries(
        Object.entries(prev).map(([key, row]) => [key, { ...row, status: 'holiday', hours: '', customLabel: '' }])
      ) as Record<number, DesktopAttendanceRow>);
      return;
    }
    updateRow(id, {
      status,
      hours: status === 'worked' ? formatDesktopHours(rows[id]?.hours || '8') : '',
      customLabel: status === 'custom' ? rows[id]?.customLabel ?? '' : '',
    });
  };

  const handleSave = () => {
    clearTimers();
    setMode('saving');
    setCompletionStep(-1);
    PREVIEW_EMPLOYEES.forEach((_, index) => {
      timersRef.current.push(window.setTimeout(() => setCompletionStep(index), 90 + index * 260));
    });
    timersRef.current.push(window.setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(18);
      setMode('saved');
      setCompletionStep(PREVIEW_EMPLOYEES.length - 1);
    }, 90 + Math.max(0, PREVIEW_EMPLOYEES.length - 1) * 260 + 780));
  };

  const handleModify = () => {
    clearTimers();
    setMode('editing');
    setCompletionStep(-1);
  };

  const handleReset = () => {
    clearTimers();
    setRows(INITIAL_ROWS);
    setMode('editing');
    setCompletionStep(-1);
  };

  const locked = mode !== 'editing';

  return (
    <div className="min-h-screen select-none bg-[#F0F4FA]">
      <div className="mx-auto max-w-5xl px-6 py-5">
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-white px-4 pb-4 pt-5 shadow-sm">
          <div className="flex items-center">
            <Link href="/settings/developer" className="mr-3 p-1 text-gray-400">
              <ChevronLeft size={20} />
            </Link>
            <div>
              <h1 className="text-[17px] font-semibold text-[#1A3A8F]">考勤卡片预览（桌面端）</h1>
              <div className="mt-0.5 text-[12px] font-medium text-gray-400">沙盒假保存，不写入考勤数据</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="h-10 rounded-xl border border-gray-200 bg-white px-4 text-[14px] font-semibold text-gray-500 shadow-sm"
            >
              重置
            </button>
            {mode === 'editing' ? (
              <button
                onClick={handleSave}
                className="h-10 rounded-xl bg-[#3370FF] px-8 text-[15px] font-semibold text-white shadow-sm"
              >
                保存
              </button>
            ) : (
              <button
                onClick={handleModify}
                disabled={mode === 'saving'}
                className="h-10 rounded-xl border border-gray-200 bg-white px-6 text-[15px] font-semibold text-gray-600 shadow-sm disabled:opacity-50"
              >
                修改
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white px-6 py-5 shadow-sm">
          <DesktopAttendanceEditor
            employees={PREVIEW_EMPLOYEES}
            rows={rows}
            locked={locked}
            completionActive={mode === 'saving'}
            completionStep={completionStep}
            onAdjustHours={adjustHours}
            onSetHours={(id, value) => updateRow(id, { hours: value })}
            onNormalizeHours={id => updateRow(id, { hours: formatDesktopHours(rows[id]?.hours || '0') })}
            onSetStatus={setStatus}
            onSetCustomLabel={(id, value) => updateRow(id, { customLabel: value })}
          />
        </div>
      </div>
    </div>
  );
}
