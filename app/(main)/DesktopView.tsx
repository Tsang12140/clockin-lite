'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, Edit2, Lock } from 'lucide-react';
import type { WeatherSnapshot } from '@/lib/weather';
import { addDays, getMonday, getWeekDays } from '@/lib/utils';
import { loadMonthData, saveAttendance, unlockDay } from './actions';
import WeatherNotice from './WeatherNotice';
import DesktopAttendanceEditor, { formatDesktopHours } from './DesktopAttendanceEditor';
import type { WorkScheduleConfig } from '@/db/schema';
import { isRestDay as isScheduleRestDay, normalizeWorkSchedule } from '@/lib/workSchedule';
import { isChinaAdjustedWorkday, isChinaLegalHoliday } from '@/lib/chinaHolidays';

interface Employee { id: number; name: string; status: string | null }
interface AttRec {
  employeeId: number | null;
  workDate: string | null;
  hours: string | null;
  status: string | null;
  statusLabel: string | null;
  isLocked: boolean;
}
interface DayRecord {
  hours: string | null;
  status: string;
  statusLabel: string | null;
  isLocked: boolean;
}
interface EditRow { hours: string; status: string; customLabel: string }
type MonthData = Record<string, Record<number, DayRecord>>;

const STATUS_LABEL: Record<string, string> = {
  leave: '请假',
  holiday: '放假',
  sick: '病假',
  absent: '旷工',
  custom: '特殊',
};

const DOW_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

const WEEK_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const BACKGROUND_REFRESH_MS = 30 * 60 * 1000;

function buildMonthData(records: AttRec[]): MonthData {
  const data: MonthData = {};
  for (const r of records) {
    if (!r.employeeId || !r.workDate) continue;
    (data[r.workDate] ??= {})[r.employeeId] = {
      hours: r.hours,
      status: r.status ?? 'worked',
      statusLabel: r.statusLabel,
      isLocked: r.isLocked,
    };
  }
  return data;
}

function formatDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function resolveDefaultSelectedDate(year: number, month: number, data: MonthData, today: string) {
  const [todayYear, todayMonth] = today.split('-').map(Number);
  if (year === todayYear && month === todayMonth) return today;

  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const recordedDates = Object.keys(data)
    .filter(date => date.startsWith(prefix) && Object.keys(data[date] ?? {}).length > 0)
    .sort();

  return recordedDates[recordedDates.length - 1] ?? formatDate(year, month, 1);
}

export default function DesktopView({
  employees,
  initialMonthData,
  today,
  initialYear,
  initialMonth,
  missedDate,
  lastWorkedHours,
  weatherSnapshot,
  workSchedule,
  workEndHour,
}: {
  employees: Employee[];
  initialMonthData: AttRec[];
  today: string;
  initialYear: number;
  initialMonth: number;
  missedDate: string | null;
  lastWorkedHours: Record<number, string>;
  weatherSnapshot?: WeatherSnapshot | null;
  workSchedule?: WorkScheduleConfig | null;
  workEndHour?: number;
}) {
  const activeWorkSchedule = useMemo(() => normalizeWorkSchedule(workSchedule), [workSchedule]);
  const isConfiguredRestDay = (date: string) => {
    if (isChinaAdjustedWorkday(date)) return false;
    if (isChinaLegalHoliday(date)) return true;
    return isScheduleRestDay(date, activeWorkSchedule);
  };
  const [year,          setYear]          = useState(initialYear);
  const [month,         setMonth]         = useState(initialMonth);
  const [monthData,     setMonthData]     = useState<MonthData>(() => buildMonthData(initialMonthData));
  const [selectedDate,  setSelectedDate]  = useState<string | null>(today);
  const [editRows,      setEditRows]      = useState<Record<number, EditRow>>({});
  const [unlockedDates, setUnlockedDates] = useState<Set<string>>(new Set());
  const [toast,         setToast]         = useState('');
  const [completionWaveDate, setCompletionWaveDate] = useState<string | null>(null);
  const [completionWaveStep, setCompletionWaveStep] = useState(-1);
  const monthRequestRef = useRef(0);
  const completionTimerRef = useRef<number | null>(null);
  const completionStepTimerRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const backgroundRefreshRef = useRef({ inFlight: false, lastAt: Date.now() });

  const [isLoadingMonth, startMonthTransition] = useTransition();
  const [isSaving,       startSaveTransition]  = useTransition();

  const lastDay  = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const offset   = (firstDow + 6) % 7;
  const weeks    = Math.ceil((offset + lastDay) / 7);

  const nowDate   = new Date();
  const canGoNext = !(year === nowDate.getFullYear() && month === nowDate.getMonth() + 1);

  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    const dayRecs = monthData[selectedDate] ?? {};
    const rows: Record<number, EditRow> = {};
    for (const emp of employees) {
      const rec = dayRecs[emp.id];
      rows[emp.id] = rec
        ? {
            status: rec.status,
            hours: rec.status === 'worked' ? formatDesktopHours(rec.hours ?? '8') : '',
            customLabel: rec.status === 'custom' ? (rec.statusLabel ?? '') : '',
          }
        : { status: 'worked', hours: formatDesktopHours(lastWorkedHours[emp.id] ?? '8'), customLabel: '' };
    }
    const timer = window.setTimeout(() => {
      if (!cancelled) setEditRows(rows);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedDate, monthData, employees, lastWorkedHours]);

  useEffect(() => () => {
    if (completionTimerRef.current) window.clearTimeout(completionTimerRef.current);
    if (completionStepTimerRef.current) window.clearInterval(completionStepTimerRef.current);
  }, []);


  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const navigateMonth = (delta: number) => {
    dirtyRef.current = false;
    let m = month + delta;
    let y = year;
    if (m < 1)  { m = 12; y--; }
    if (m > 12) { m = 1;  y++; }
    const requestId = ++monthRequestRef.current;
    startMonthTransition(async () => {
      try {
        const recs = await loadMonthData(y, m);
        if (monthRequestRef.current !== requestId) return;
        const nextMonthData = buildMonthData(recs);
        setMonthData(nextMonthData);
        setYear(y);
        setMonth(m);
        setSelectedDate(resolveDefaultSelectedDate(y, m, nextMonthData, today));
      } catch {
        if (monthRequestRef.current === requestId) showToast('月份数据加载失败');
      }
    });
  };

  const isDayLocked = (date: string) => {
    if (unlockedDates.has(date)) return false;
    if (date < today && Object.keys(monthData[date] ?? {}).length > 0) return true;
    const vals = Object.values(monthData[date] ?? {});
    return vals.length > 0 && vals[0].isLocked;
  };

  const hasDayRecords = (date: string) => Object.keys(monthData[date] ?? {}).length > 0;

  const getDaySummary = (date: string) => {
    const recs = Object.values(monthData[date] ?? {});
    let hasAbsent = false;
    const seen = new Set<string>();
    const specials: string[] = [];
    for (const rec of recs) {
      if (rec.status && rec.status !== 'worked') {
        if (rec.status === 'absent') hasAbsent = true;
        const lbl = STATUS_LABEL[rec.status] ?? '特殊';
        if (!seen.has(lbl)) {
          seen.add(lbl);
          specials.push(lbl);
        }
      }
    }
    return { specialLabel: specials.join(' '), hasAbsent, hasRecs: recs.length > 0 };
  };

  const buildEntries = (overrideStatus?: string) =>
    employees.map(emp => {
      const row = editRows[emp.id] ?? { status: 'worked', hours: '8', customLabel: '' };
      const s = overrideStatus ?? row.status;
      return {
        employeeId:  emp.id,
        workDate:    selectedDate!,
        hours:       s === 'worked' ? (parseFloat(row.hours) || null) : null,
        status:      s,
        statusLabel: s === 'custom' ? (row.customLabel || null) : null,
      };
    });

  const applySave = (entries: ReturnType<typeof buildEntries>) => {
    const saved: Record<number, DayRecord> = {};
    for (const e of entries) {
      saved[e.employeeId] = {
        hours: e.hours !== null ? String(e.hours) : null,
        status: e.status,
        statusLabel: e.statusLabel,
        isLocked: true,
      };
    }
    setMonthData(prev => ({ ...prev, [selectedDate!]: saved }));
    dirtyRef.current = false;
    setUnlockedDates(prev => {
      const s = new Set(prev);
      s.delete(selectedDate!);
      return s;
    });
  };

  const handleSave = () => {
    if (!selectedDate) return;
    startSaveTransition(async () => {
      const shouldCelebrate = !hasDayRecords(selectedDate);
      const entries = buildEntries();
      const r = await saveAttendance(entries);
      if (r.ok) {
        applySave(entries);
        if (shouldCelebrate) triggerCompletionWave(selectedDate);
        showToast('保存成功 ✓');
      } else {
        showToast('保存失败');
      }
    });
  };

  const handleUnlock = () => {
    if (!selectedDate) return;
    startSaveTransition(async () => {
      const r = await unlockDay(selectedDate);
      if (r.ok) {
        setUnlockedDates(prev => new Set([...prev, selectedDate]));
        showToast('已解锁，可重新编辑');
      }
    });
  };

  const handleHoliday = () => {
    if (!selectedDate) return;
    const label = new Date(selectedDate + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    if (!confirm(`确认 ${label} 全体放假？`)) return;
    startSaveTransition(async () => {
      const shouldCelebrate = !hasDayRecords(selectedDate);
      const entries = buildEntries('holiday');
      const r = await saveAttendance(entries);
      if (r.ok) {
        applySave(entries);
        if (shouldCelebrate) triggerCompletionWave(selectedDate);
        showToast('全体放假已记录 ✓');
      } else {
        showToast('操作失败');
      }
    });
  };

  const triggerCompletionWave = (date: string) => {
    setCompletionWaveDate(date);
    setCompletionWaveStep(0);
    if (completionTimerRef.current) window.clearTimeout(completionTimerRef.current);
    if (completionStepTimerRef.current) window.clearInterval(completionStepTimerRef.current);
    const total = Math.max(employees.length, 1);
    let nextStep = 1;
    completionStepTimerRef.current = window.setInterval(() => {
      if (nextStep >= total) {
        if (completionStepTimerRef.current) window.clearInterval(completionStepTimerRef.current);
        completionStepTimerRef.current = null;
        return;
      }
      setCompletionWaveStep(nextStep);
      nextStep += 1;
    }, 260);
    completionTimerRef.current = window.setTimeout(() => {
      setCompletionWaveDate(current => current === date ? null : current);
      setCompletionWaveStep(-1);
    }, 90 + (total - 1) * 260 + 780);
  };

  const setStatus = (empId: number, status: string) => {
    if (status === 'all_holiday') {
      handleHoliday();
      return;
    }
    dirtyRef.current = true;
    setEditRows(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        status,
        hours: status === 'worked' ? formatDesktopHours(prev[empId]?.hours || lastWorkedHours[empId] || '8') : '',
      },
    }));
  };

  const adjustHours = (empId: number, delta: number) =>
    setEditRows(prev => {
      dirtyRef.current = true;
      const next = Math.max(0, Math.min(24, parseFloat(((parseFloat(prev[empId]?.hours || '0')) + delta).toFixed(1))));
      return { ...prev, [empId]: { ...prev[empId], hours: next.toFixed(1) } };
    });

  const setHours = (id: number, v: string) => {
    dirtyRef.current = true;
    setEditRows(p => ({ ...p, [id]: { ...p[id], hours: v } }));
  };
  const normalizeHours = (id: number) => {
    dirtyRef.current = true;
    setEditRows(p => ({ ...p, [id]: { ...p[id], hours: formatDesktopHours(p[id]?.hours || '0') } }));
  };
  const setCustomLabel = (id: number, v: string) => {
    dirtyRef.current = true;
    setEditRows(p => ({ ...p, [id]: { ...p[id], customLabel: v } }));
  };

  useEffect(() => {
    const refreshQuietly = async () => {
      if (backgroundRefreshRef.current.inFlight) return;
      if (document.visibilityState !== 'visible') return;
      if (!selectedDate || dirtyRef.current || unlockedDates.has(selectedDate) || isSaving || isLoadingMonth) return;

      backgroundRefreshRef.current.inFlight = true;
      const requestId = monthRequestRef.current;
      try {
        const recs = await loadMonthData(year, month);
        if (monthRequestRef.current !== requestId) return;
        setMonthData(buildMonthData(recs));
        backgroundRefreshRef.current.lastAt = Date.now();
      } catch {
      } finally {
        backgroundRefreshRef.current.inFlight = false;
      }
    };

    const refreshIfStale = () => {
      if (Date.now() - backgroundRefreshRef.current.lastAt >= BACKGROUND_REFRESH_MS) {
        void refreshQuietly();
      }
    };

    const timer = window.setInterval(refreshQuietly, BACKGROUND_REFRESH_MS);
    window.addEventListener('focus', refreshIfStale);
    window.addEventListener('pageshow', refreshIfStale);
    document.addEventListener('visibilitychange', refreshIfStale);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshIfStale);
      window.removeEventListener('pageshow', refreshIfStale);
      document.removeEventListener('visibilitychange', refreshIfStale);
    };
  }, [year, month, selectedDate, unlockedDates, isSaving, isLoadingMonth]);

  const locked = selectedDate ? isDayLocked(selectedDate) : false;
  const hasRecs = selectedDate ? hasDayRecords(selectedDate) : false;
  const completionActive = completionWaveDate === selectedDate;
  const displayDate = selectedDate
    ? `${new Date(selectedDate + 'T00:00:00').toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })} · ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('zh-CN', { weekday: 'short' })}`
    : null;
  const weekStart = getMonday(selectedDate ?? today);
  const weekDays = getWeekDays(weekStart);
  const currentWeekStart = getMonday(today);
  const canGoNextWeek = addDays(weekStart, 7) <= currentWeekStart;

  const openAdjacentWeek = (direction: -1 | 1) => {
    const targetWeekStart = addDays(weekStart, direction * 7);
    let targetDate = addDays(selectedDate ?? weekStart, direction * 7);
    if (direction > 0 && targetWeekStart === currentWeekStart && targetDate > today) {
      targetDate = today;
    }
    openDate(targetDate);
  };

  const openMissedDate = () => {
    if (!missedDate) return;
    dirtyRef.current = false;
    const [y, m] = missedDate.split('-').map(Number);
    const requestId = ++monthRequestRef.current;
    setSelectedDate(missedDate);
    if (y !== year || m !== month) {
      startMonthTransition(async () => {
        try {
          const recs = await loadMonthData(y, m);
          if (monthRequestRef.current !== requestId) return;
          setMonthData(buildMonthData(recs));
          setYear(y);
          setMonth(m);
        } catch {
          if (monthRequestRef.current === requestId) showToast('月份数据加载失败');
        }
      });
    }
  };

  const openDate = (date: string) => {
    dirtyRef.current = false;
    const [y, m] = date.split('-').map(Number);
    const requestId = ++monthRequestRef.current;
    setSelectedDate(date);
    if (y !== year || m !== month) {
      startMonthTransition(async () => {
        try {
          const recs = await loadMonthData(y, m);
          if (monthRequestRef.current !== requestId) return;
          setMonthData(buildMonthData(recs));
          setYear(y);
          setMonth(m);
        } catch {
          if (monthRequestRef.current === requestId) showToast('月份数据加载失败');
        }
      });
    }
  };

  const renderWeekCell = (rec: DayRecord | undefined, date: string) => {
    if (!rec) {
      return isConfiguredRestDay(date) && date <= today
        ? <span className="text-[12px] font-semibold text-[#3370FF]/45">休</span>
        : null;
    }
    if (rec.status === 'worked') {
      return <span className="text-[13px] font-bold text-[#1A3A8F]">{formatDesktopHours(rec.hours)}</span>;
    }
    const label = rec.status === 'custom'
      ? (rec.statusLabel || '特殊')
      : (STATUS_LABEL[rec.status] ?? '特殊');
    const cls = rec.status === 'absent'
      ? 'text-red-500 bg-red-50'
      : rec.status === 'holiday'
        ? 'text-green-600 bg-green-50'
        : 'text-orange-500 bg-orange-50';
    return <span className={`inline-flex px-2 py-1 rounded-md text-[12px] font-semibold ${cls}`}>{label}</span>;
  };

  return (
    <div className="min-h-screen select-none bg-[#F0F4FA]">
      <div className="max-w-7xl mx-auto px-6 py-5">
        <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-5 items-stretch">
          <main className="min-w-0">
            <div className="h-full bg-white rounded-2xl shadow-sm px-6 py-5">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-gray-500">考勤录入</div>
                  <div className="mt-1 flex items-center gap-2 min-w-0">
                    {locked && <Lock size={16} className="text-gray-400 shrink-0" />}
                    {!locked && hasRecs && <Edit2 size={16} className="text-[#3370FF] shrink-0" />}
                    <span className={`truncate text-[22px] font-bold ${locked ? 'text-gray-700' : hasRecs ? 'text-[#3370FF]' : 'text-[#1A3A8F]'}`}>
                      {displayDate ?? '请选择日期'}
                    </span>
                  </div>
                </div>
                {selectedDate && (
                  <div className="flex gap-2 shrink-0">
                    {locked ? (
                      <button onClick={handleUnlock} disabled={isSaving}
                        className="h-10 px-6 bg-white border border-gray-200 text-gray-600 text-[15px] font-semibold rounded-xl shadow-sm disabled:opacity-60">
                        修改
                      </button>
                    ) : (
                      <button onClick={handleSave} disabled={isSaving}
                        className="h-10 px-8 bg-[#3370FF] text-white text-[15px] font-semibold rounded-xl shadow-sm disabled:opacity-60">
                        {isSaving ? '保存中' : '保存'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {selectedDate ? (
                <DesktopAttendanceEditor
                  employees={employees}
                  rows={editRows}
                  locked={locked}
                  completionActive={completionActive}
                  completionStep={completionWaveStep}
                  onAdjustHours={adjustHours}
                  onSetHours={setHours}
                  onNormalizeHours={normalizeHours}
                  onSetStatus={setStatus}
                  onSetCustomLabel={setCustomLabel}
                />
              ) : (
                <div className="h-64 flex items-center justify-center rounded-xl border border-dashed border-gray-200 text-[15px] font-medium text-gray-400">
                  从右侧日历选择一个日期
                </div>
              )}

              <div className="mt-5 rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between bg-[#F8FAFF] px-4 py-3 border-b border-gray-100">
                  <div className="text-[13px] font-semibold text-gray-500">本周校对</div>
                  <div className="flex items-center gap-2 text-[12px]">
                    <button
                      type="button"
                      onClick={() => openAdjacentWeek(-1)}
                      disabled={isLoadingMonth}
                      className="h-7 px-2.5 rounded-lg border border-gray-200 bg-white text-gray-500 font-medium shadow-sm disabled:bg-gray-50 disabled:text-gray-300 disabled:shadow-none"
                    >
                      上周
                    </button>
                    <span className="min-w-[82px] text-center font-normal text-gray-400">
                      {weekDays[0].slice(5).replace('-', '/')} - {weekDays[6].slice(5).replace('-', '/')}
                    </span>
                    <button
                      type="button"
                      onClick={() => openAdjacentWeek(1)}
                      disabled={!canGoNextWeek || isLoadingMonth}
                      className="h-7 px-2.5 rounded-lg border border-gray-200 bg-white text-gray-500 font-medium shadow-sm disabled:bg-gray-50 disabled:text-gray-300 disabled:shadow-none"
                    >
                      下周
                    </button>
                  </div>
                </div>
                <div className="overflow-hidden">
                  <table className="w-full text-[12px]" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '88px' }} />
                      {weekDays.map(date => <col key={date} style={{ width: '64px' }} />)}
                      <col style={{ width: '58px' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="text-center bg-white px-3 py-3 text-gray-500 font-semibold border-b border-gray-200">姓名</th>
                        {weekDays.map((date, index) => {
                          const isSelected = date === selectedDate;
                          const dayNum = parseInt(date.slice(8, 10));
                          return (
                            <th key={date}
                              className={`border-l border-gray-200 text-center font-semibold border-b border-gray-200 ${isSelected ? 'bg-blue-50 text-[#3370FF]' : 'bg-white text-gray-500 hover:bg-blue-50/60'}`}>
                              <button type="button" onClick={() => openDate(date)} className="block w-full px-1 py-3">
                                <div>{WEEK_LABELS[index]}</div>
                                <div className="text-[12px] mt-0.5">{dayNum}日</div>
                              </button>
                            </th>
                          );
                        })}
                        <th className="border-l border-gray-200 text-center bg-white px-1 py-3 text-gray-500 font-semibold border-b border-gray-200">合计</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((emp, rowIdx) => {
                        let total = 0;
                        const isLast = rowIdx === employees.length - 1;
                        return (
                          <tr key={emp.id}>
                            <td className={`select-text bg-white px-3 py-3 text-center text-[13px] font-semibold text-gray-700 ${!isLast ? 'border-b border-gray-200' : ''}`}>
                              {emp.name}
                            </td>
                            {weekDays.map(date => {
                              const rec = monthData[date]?.[emp.id];
                              const isSelected = date === selectedDate;
                              if (rec?.status === 'worked' && rec.hours) total += parseFloat(rec.hours);
                              return (
                                <td key={date}
                                  className={`border-l border-gray-200 p-0 text-center ${isSelected ? 'bg-blue-50/60' : 'bg-white hover:bg-blue-50/50'} ${!isLast ? 'border-b border-gray-200' : ''}`}>
                                  <button type="button" onClick={() => openDate(date)} className="w-full min-h-[52px] px-1 py-3 flex items-center justify-center">
                                    {renderWeekCell(rec, date)}
                                  </button>
                                </td>
                              );
                            })}
                            <td className={`border-l border-gray-200 bg-white px-1 py-3 text-center text-[13px] font-bold text-[#1A3A8F] ${!isLast ? 'border-b border-gray-200' : ''}`}>
                              {total > 0 ? (total % 1 === 0 ? total : total.toFixed(1)) : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </main>

          <aside className="flex h-full flex-col gap-4">
            <WeatherNotice
              initialSnapshot={weatherSnapshot ?? null}
              variant="desktop"
              today={today}
              selectedDate={selectedDate}
              workEndHour={workEndHour}
            />

            {missedDate && (
              <div className="h-12 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4">
                <span className="text-[13px] font-semibold text-amber-700">
                  {new Date(missedDate + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} 未录入
                </span>
                <button onClick={openMissedDate}
                  className="ml-auto h-8 px-4 bg-amber-500 text-white text-[13px] font-semibold rounded-xl">
                  补录
                </button>
              </div>
            )}
            {!missedDate && (
              <div className="h-12 flex items-center rounded-2xl border border-green-100 bg-green-50 px-4">
                <span className="text-[13px] font-semibold text-green-600">暂无待补录</span>
              </div>
            )}

            <div className={`shrink-0 rounded-2xl bg-white shadow-sm transition-opacity ${isLoadingMonth ? 'opacity-50' : ''}`}>
              <div className="flex h-[72px] items-center justify-between px-5">
                <button onClick={() => navigateMonth(-1)} disabled={isLoadingMonth}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F0F4FA] text-gray-500 transition-colors hover:bg-gray-200 disabled:opacity-40">
                  <ChevronLeft size={18} />
                </button>
                <span className="text-[20px] font-bold text-[#1A3A8F] select-none">
                  {year}年{month}月
                </span>
                <button onClick={() => navigateMonth(1)} disabled={!canGoNext || isLoadingMonth}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F0F4FA] text-gray-500 transition-colors hover:bg-gray-200 disabled:opacity-40">
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="mx-5 border-t border-[#E8EEF8]" />

              <div
                className="grid bg-white px-5 pt-3"
                style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
              >
                {DOW_LABELS.map((l, i) => (
                  <div key={l} className={`flex h-8 min-w-0 items-center justify-center text-[12px] font-semibold ${i === 6 ? 'text-red-300' : 'text-gray-400'}`}>{l}</div>
                ))}
              </div>

              <div
                className="grid bg-white px-5 pb-5"
                style={{
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  columnGap: '6px',
                  rowGap: '8px',
                }}
              >
                {Array.from({ length: weeks * 7 }, (_, index) => {
                  const day = index - offset + 1;
                  if (day < 1 || day > lastDay) return <div key={index} className="h-11 min-w-0" />;

                  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const { hasRecs } = getDaySummary(date);
                  const isToday = date === today;
                  const isSelected = date === selectedDate;
                  const restDay = isConfiguredRestDay(date);
                  const isFuture = date > today;
                  const isRestOnly = restDay
                    && hasRecs
                    && Object.values(monthData[date] ?? {}).every(rec => rec.status === 'holiday');

                  return (
                    <button key={date}
                      onClick={() => setSelectedDate(date)}
                      className={`flex h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-lg transition-colors
                        ${isSelected ? 'bg-[#3370FF] text-white shadow-sm' : isToday ? 'bg-blue-50 text-[#3370FF]' : 'hover:bg-blue-50/60'}
                        ${restDay && !isSelected ? 'opacity-45' : ''}
                        ${isFuture && !isSelected ? 'opacity-40' : ''}`}>
                      <span className={`text-[16px] font-bold leading-none ${isSelected ? 'text-white' : ''}`}>{day}</span>
                      {isRestOnly ? (
                        <span className={`w-1.5 h-1.5 rounded-full border ${isSelected ? 'border-white' : 'border-[#3370FF]'}`} />
                      ) : hasRecs ? (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-[#3370FF]'}`} />
                      ) : restDay && !isFuture ? (
                        <span className={`w-1.5 h-1.5 rounded-full border ${isSelected ? 'border-white' : 'border-[#3370FF]'}`} />
                      ) : !isFuture && !restDay ? (
                        <span className={`w-1.5 h-1.5 rounded-full border ${isSelected ? 'border-white' : 'border-gray-300'}`} />
                      ) : (
                        <span className="w-1.5 h-1.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div aria-hidden="true" className="min-h-0 flex-1 rounded-2xl border border-[#E8EEF8] bg-[#F8FAFF]" />
          </aside>
        </div>

        {toast && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[13px] px-4 py-2 rounded-full shadow-lg z-50">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
