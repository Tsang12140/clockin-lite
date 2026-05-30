'use client';

import { useState, useTransition, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Lock, Check, Trash2, ChevronDown } from 'lucide-react';
import { saveAttendance, unlockDay, loadWeekData, clearAttendanceDay } from './actions';
import { getMonday, addDays, getWeekDays } from '@/lib/utils';
import { findWeatherDay, getWeatherDecisionForDay, getWeatherEmoji } from '@/lib/weather';
import type { WeatherSnapshot } from '@/lib/weather';
import { playCompletionSound, primeCompletionSound } from '@/lib/completionSound';
import WeatherBg from './WeatherBg';
import { useWeatherSnapshot } from './useWeatherSnapshot';
import type { WorkScheduleConfig } from '@/db/schema';
import { isRestDay as isScheduleRestDay, normalizeWorkSchedule } from '@/lib/workSchedule';
import { isChinaAdjustedWorkday, isChinaLegalHoliday } from '@/lib/chinaHolidays';

interface Employee { id: number; name: string; status: string | null }
interface AttRec {
  employeeId: number | null; workDate: string | null;
  hours: string | null; status: string | null;
  statusLabel: string | null; isLocked: boolean;
}
interface DayRecord {
  hours: string | null; status: string;
  statusLabel: string | null; isLocked: boolean;
}
interface EditRow { hours: string; status: string; customLabel: string }
interface AttendanceEntry {
  employeeId: number;
  workDate: string;
  hours: number | null;
  status: string;
  statusLabel: string | null;
}
type WeekData = Record<string, Record<number, DayRecord>>;

const AUTO_REST_MINUTES = 20 * 60 + 30;
const REST_CARRY_END_MINUTES = 7 * 60 + 30;
const BACKGROUND_REFRESH_MS = 30 * 60 * 1000;

function getDayOfWeek(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function getCurrentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

const STATUS_OPTIONS = [
  { value: 'worked',  label: '正常' },
  { value: 'leave',   label: '请假' },
  { value: 'holiday', label: '放假' },
  { value: 'sick',    label: '病假' },
  { value: 'absent',  label: '旷工' },
  { value: 'custom',  label: '自定义…' },
  { value: 'all_holiday', label: '全体放假' },
];

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

const STATUS_CELL: Record<string, { text: string; cls: string }> = {
  leave:   { text: '假', cls: 'text-orange-400' },
  holiday: { text: '休', cls: 'text-green-500'  },
  sick:    { text: '病', cls: 'text-rose-400'   },
  absent:  { text: '旷', cls: 'text-red-500'    },
};

// Badge styles for locked state display
const STATUS_BADGE: Record<string, { text: string; cls: string }> = {
  worked:  { text: '正常', cls: 'text-[#3370FF] bg-[#3370FF]/10' },
  leave:   { text: '请假', cls: 'text-orange-500 bg-orange-50' },
  holiday: { text: '放假', cls: 'text-green-600 bg-green-50'  },
  sick:    { text: '病假', cls: 'text-rose-500 bg-rose-50'    },
  absent:  { text: '旷工', cls: 'text-red-600 bg-red-50'      },
};

function buildWeekData(records: AttRec[]): WeekData {
  const data: WeekData = {};
  for (const r of records) {
    if (!r.employeeId || !r.workDate) continue;
    (data[r.workDate] ??= {})[r.employeeId] = {
      hours: r.hours, status: r.status ?? 'worked',
      statusLabel: r.statusLabel, isLocked: r.isLocked,
    };
  }
  return data;
}

function renderSummaryCell(rec?: DayRecord, defaultRest = false): ReactNode {
  if (!rec) {
    return defaultRest
      ? <span className="font-semibold text-[#3370FF]/45">休</span>
      : <span className="text-gray-200">·</span>;
  }
  if (rec.status === 'worked' && rec.hours) {
    const h = parseFloat(rec.hours);
    return <span className="font-semibold text-[#3370FF]">{h % 1 === 0 ? h : h.toFixed(1)}</span>;
  }
  if (rec.status === 'custom') {
    const t = rec.statusLabel ?? '自';
    return <span className="font-semibold text-purple-400 text-[11px]">{t.length <= 3 ? t : t.slice(0, 2) + '…'}</span>;
  }
  const s = STATUS_CELL[rec.status];
  return s ? <span className={`font-semibold ${s.cls}`}>{s.text}</span> : <span className="text-gray-200">·</span>;
}

export default function TodayEntry({
  employees, initialAttendance, today, initialWeekStart, missedDate, lastWorkedHours, weatherSnapshot, weatherCity, workSchedule, workEndHour,
}: {
  employees: Employee[];
  initialAttendance: AttRec[];
  today: string;
  initialWeekStart: string;
  missedDate: string | null;
  lastWorkedHours: Record<number, string>;
  weatherSnapshot?: WeatherSnapshot | null;
  weatherCity?: string;
  workSchedule?: WorkScheduleConfig | null;
  workEndHour?: number;
}) {
  const todaysWeekStart = getMonday(today);
  const activeWorkSchedule = useMemo(() => normalizeWorkSchedule(workSchedule), [workSchedule]);
  const isConfiguredRestDay = (date: string) => {
    if (isChinaAdjustedWorkday(date)) return false;
    if (isChinaLegalHoliday(date)) return true;
    return isScheduleRestDay(date, activeWorkSchedule);
  };

  const [weekStart,       setWeekStart]       = useState(initialWeekStart);
  const [selectedDate,    setSelectedDate]    = useState(today);
  const [weekData,        setWeekData]        = useState<WeekData>(() => buildWeekData(initialAttendance));
  const [editRows,        setEditRows]        = useState<Record<number, EditRow>>({});
  const [toast,           setToast]           = useState('');
  const [activeMissedDate, setActiveMissedDate] = useState(missedDate);
  const [unlockedDates,    setUnlockedDates]    = useState<Set<string>>(new Set());
  const [completionWaveDate, setCompletionWaveDate] = useState<string | null>(null);
  const [completionWaveStep, setCompletionWaveStep] = useState(-1);
  const [isLoadingWeek, startWeekTransition] = useTransition();
  const [isSaving,      startSaveTransition] = useTransition();
  const [fontLevel,     setFontLevel]        = useState(0);
  const [celebration,   setCelebration]      = useState(true);
  const [weatherHour,   setWeatherHour]      = useState<number | null>(null);
  const autoRestAttemptRef = useRef<string | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const completionStepTimerRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const backgroundRefreshRef = useRef({ inFlight: false, lastAt: Date.now() });
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const readFontLevel = () => {
      const next = Number.parseInt(localStorage.getItem('clockin_fontsize') ?? '0', 10);
      setFontLevel(Number.isFinite(next) ? next : 0);
      setCelebration(localStorage.getItem('clockin_celebration') !== 'off');
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') readFontLevel();
    };
    const timer = window.setTimeout(readFontLevel, 0);
    window.addEventListener('focus', readFontLevel);
    window.addEventListener('pageshow', readFontLevel);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', readFontLevel);
      window.removeEventListener('pageshow', readFontLevel);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const readWeatherHour = () => setWeatherHour(new Date().getHours());
    readWeatherHour();
    const timer = window.setInterval(readWeatherHour, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    if (completionTimerRef.current) window.clearTimeout(completionTimerRef.current);
    if (completionStepTimerRef.current) window.clearInterval(completionStepTimerRef.current);
  }, []);

  useEffect(() => {
    if (openDropdownId === null) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!statusMenuRef.current?.contains(event.target as Node)) {
        setOpenDropdownId(null);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [openDropdownId]);

  useEffect(() => {
    let cancelled = false;
    const dayRecs = weekData[selectedDate] ?? {};
    const rows: Record<number, EditRow> = {};
    for (const emp of employees) {
      const rec = dayRecs[emp.id];
      rows[emp.id] = rec
        ? {
            status:      rec.status,
            hours:       rec.status === 'worked' ? (rec.hours ?? '8') : '',
            customLabel: rec.status === 'custom'  ? (rec.statusLabel ?? '') : '',
          }
        : { status: 'worked', hours: lastWorkedHours[emp.id] ?? '8', customLabel: '' };
    }
    const timer = window.setTimeout(() => {
      if (!cancelled) setEditRows(rows);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedDate, weekData, employees, lastWorkedHours]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000); };

  const weekDays      = getWeekDays(weekStart);
  const hasDayRecords = (date: string) => Object.keys(weekData[date] ?? {}).length > 0;
  const isDayLocked   = (date: string): boolean => {
    if (unlockedDates.has(date)) return false;
    if (date < today && hasDayRecords(date)) return true;
    const vals = Object.values(weekData[date] ?? {});
    return vals.length > 0 && vals[0].isLocked;
  };

  const switchWeek = (newStart: string) => {
    dirtyRef.current = false;
    startWeekTransition(async () => {
      try {
        const recs    = await loadWeekData(newStart);
        const newData = buildWeekData(recs);
        setWeekData(newData);
        setWeekStart(newStart);
        const days = getWeekDays(newStart);
        setSelectedDate(days.includes(today) ? today : newStart);
      } catch {}
    });
  };

  const goToDate = (date: string) => {
    dirtyRef.current = false;
    const targetWeekStart = getMonday(date);
    if (targetWeekStart === weekStart) { setSelectedDate(date); return; }
    startWeekTransition(async () => {
      try {
        const recs = await loadWeekData(targetWeekStart);
        setWeekData(buildWeekData(recs));
        setWeekStart(targetWeekStart);
        setSelectedDate(date);
      } catch {}
    });
  };

  const buildEntriesForDate = (date: string, overrideStatus?: string): AttendanceEntry[] =>
    employees.map(emp => {
      const row = editRows[emp.id] ?? { status: 'worked', hours: '8', customLabel: '' };
      const s   = overrideStatus ?? row.status;
      return {
        employeeId:  emp.id,
        workDate:    date,
        hours:       s === 'worked' ? (parseFloat(row.hours) || null) : null,
        status:      s,
        statusLabel: s === 'custom' ? (row.customLabel || null) : null,
      };
    });

  const buildEntries = (overrideStatus?: string) => buildEntriesForDate(selectedDate, overrideStatus);

  const buildRestEntriesForDate = (date: string): AttendanceEntry[] =>
    employees.map(emp => ({
      employeeId:  emp.id,
      workDate:    date,
      hours:       null,
      status:      'holiday',
      statusLabel: null,
    }));

  const applySaveForDate = (date: string, entries: AttendanceEntry[]) => {
    const saved: Record<number, DayRecord> = {};
    for (const e of entries) {
      saved[e.employeeId] = {
        hours: e.hours !== null ? String(e.hours) : null,
        status: e.status, statusLabel: e.statusLabel, isLocked: true,
      };
    }
    setWeekData(prev => ({ ...prev, [date]: saved }));
    if (date === selectedDate) dirtyRef.current = false;
    if (date === activeMissedDate) setActiveMissedDate(null);
    setUnlockedDates(prev => { const s = new Set(prev); s.delete(date); return s; });
  };

  const applySave = (entries: AttendanceEntry[]) => applySaveForDate(selectedDate, entries);

  useEffect(() => {
    if (!isConfiguredRestDay(today) || hasDayRecords(today)) return;

    const runAutoRest = () => {
      if (autoRestAttemptRef.current === today || hasDayRecords(today)) return;
      autoRestAttemptRef.current = today;
      const entries = buildRestEntriesForDate(today);
      startSaveTransition(async () => {
        try {
          const latestWeekRecords = await loadWeekData(todaysWeekStart);
          if (latestWeekRecords.some(rec => rec.workDate === today)) return;
          const r = await saveAttendance(entries);
          if (r.ok) {
            if (weekStart === todaysWeekStart) applySaveForDate(today, entries);
            showToast('休息日已自动记录');
          }
        } catch {}
      });
    };

    const now = new Date();
    const target = new Date(now);
    target.setHours(Math.floor(AUTO_REST_MINUTES / 60), AUTO_REST_MINUTES % 60, 0, 0);
    const delay = target.getTime() - now.getTime();
    if (delay <= 0) {
      runAutoRest();
      return;
    }

    const timer = window.setTimeout(runAutoRest, delay);
    return () => window.clearTimeout(timer);
  }, [today, weekStart, weekData, employees, todaysWeekStart, activeWorkSchedule]);

  useEffect(() => {
    const refreshQuietly = async () => {
      if (backgroundRefreshRef.current.inFlight) return;
      if (document.visibilityState !== 'visible') return;
      if (dirtyRef.current || unlockedDates.has(selectedDate) || isSaving || isLoadingWeek) return;

      backgroundRefreshRef.current.inFlight = true;
      try {
        const recs = await loadWeekData(weekStart);
        setWeekData(buildWeekData(recs));
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
  }, [weekStart, selectedDate, unlockedDates, isSaving, isLoadingWeek]);

  const triggerCompletionWave = (date: string) => {
    setCompletionWaveDate(date);
    setCompletionWaveStep(0);
    if (completionTimerRef.current) window.clearTimeout(completionTimerRef.current);
    if (completionStepTimerRef.current) window.clearInterval(completionStepTimerRef.current);
    const total = Math.max(employees.length, 1);
    const playCompletionCue = () => {
      playCompletionSound();
    };
    if (total === 1) playCompletionCue();
    let nextStep = 1;
    completionStepTimerRef.current = window.setInterval(() => {
      if (nextStep >= total) {
        if (completionStepTimerRef.current) window.clearInterval(completionStepTimerRef.current);
        completionStepTimerRef.current = null;
        return;
      }
      const stepToShow = nextStep;
      setCompletionWaveStep(stepToShow);
      if (stepToShow === total - 1) playCompletionCue();
      nextStep += 1;
    }, 300);
    completionTimerRef.current = window.setTimeout(() => {
      setCompletionWaveDate(current => current === date ? null : current);
      setCompletionWaveStep(-1);
    }, 90 + (total - 1) * 300 + 860);
  };

  const handleSave = () => {
    const shouldCelebrate = celebration;
    if (shouldCelebrate) primeCompletionSound();
    startSaveTransition(async () => {
    const entries = buildEntries();
    const r = await saveAttendance(entries);
    if (r.ok && shouldCelebrate) triggerCompletionWave(selectedDate);
    if (r.ok) { applySave(entries); showToast('保存成功 ✓'); } else showToast('保存失败');
    });
  };

  const handleHoliday = () => {
    const label = new Date(selectedDate + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    if (!confirm(`确认 ${label} 全体放假？`)) return;
    const shouldCelebrate = celebration;
    if (shouldCelebrate) primeCompletionSound();
    startSaveTransition(async () => {
      const entries = buildEntries('holiday');
      const r = await saveAttendance(entries);
      if (r.ok && shouldCelebrate) triggerCompletionWave(selectedDate);
      if (r.ok) { applySave(entries); showToast('全体放假已记录 ✓'); } else showToast('操作失败');
    });
  };

  const handleUnlock = () => startSaveTransition(async () => {
    const r = await unlockDay(selectedDate);
    if (r.ok) {
      setUnlockedDates(prev => new Set([...prev, selectedDate]));
      showToast('已解锁，可重新编辑');
    }
  });

  const handleClearDay = () => startSaveTransition(async () => {
    if (!hasDayRecords(selectedDate)) return;
    const label = new Date(selectedDate + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    if (!confirm(`确认清空 ${label} 的考勤记录？`)) return;
    const r = await clearAttendanceDay(selectedDate);
    if (r.ok) {
      setWeekData(prev => {
        const next = { ...prev };
        delete next[selectedDate];
        return next;
      });
      setUnlockedDates(prev => {
        const next = new Set(prev);
        next.delete(selectedDate);
        return next;
      });
      if (selectedDate < today && !isConfiguredRestDay(selectedDate)) setActiveMissedDate(selectedDate);
      showToast('已清空当天记录');
    } else {
      showToast('清空失败');
    }
  });

  const setStatus = (empId: number, status: string) => {
    if (status === 'all_holiday') { handleHoliday(); return; }
    dirtyRef.current = true;
    setEditRows(prev => ({ ...prev, [empId]: { ...prev[empId], status, hours: status === 'worked' ? (lastWorkedHours[empId] ?? '8') : '' } }));
  };

  const adjustHours = (empId: number, delta: number) =>
    setEditRows(prev => {
      dirtyRef.current = true;
      const next = Math.max(0, Math.min(24, parseFloat(((parseFloat(prev[empId]?.hours || '0')) + delta).toFixed(1))));
      return { ...prev, [empId]: { ...prev[empId], hours: next % 1 === 0 ? String(next) : next.toFixed(1) } };
    });

  const setHours = (id: number, v: string) => {
    dirtyRef.current = true;
    setEditRows(p => ({ ...p, [id]: { ...p[id], hours: v } }));
  };
  const setCustomLabel = (id: number, v: string) => {
    dirtyRef.current = true;
    setEditRows(p => ({ ...p, [id]: { ...p[id], customLabel: v } }));
  };

  const locked    = isDayLocked(selectedDate);
  const hasRecs   = hasDayRecords(selectedDate);
  const canGoNext = weekStart < todaysWeekStart;
  const currentMinutes = getCurrentMinutes();
  const selectedIsToday = selectedDate === today;
  const selectedIsRestDay = isConfiguredRestDay(selectedDate);
  const restCarryFromYesterday = selectedIsToday
    && isConfiguredRestDay(addDays(today, -1))
    && currentMinutes < REST_CARRY_END_MINUTES;

  const shouldShowMissedReminder = (date: string | null) => {
    if (!date || date === selectedDate || date > today || hasDayRecords(date)) return false;
    if (isConfiguredRestDay(date)) return false;
    return date < today || currentMinutes >= 18 * 60;
  };

  // Reminder: past missed date, or today's missing entry only after 18:00.
  const pendingUnlocked = selectedIsToday ? ([...unlockedDates].filter(shouldShowMissedReminder).sort().reverse()[0] ?? null) : null;
  const reminderDate    = selectedIsToday ? (pendingUnlocked ?? (shouldShowMissedReminder(activeMissedDate) ? activeMissedDate : null)) : null;
  const displayDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
  const weekMonth = parseInt(weekStart.slice(5, 7));
  const selectedPastWeatherDate = selectedDate < today && selectedDate >= todaysWeekStart ? selectedDate : null;
  const { snapshot: liveWeatherSnapshot, refresh: refreshWeather } = useWeatherSnapshot(weatherSnapshot ?? null, selectedPastWeatherDate);
  const weatherThreshold = workEndHour ?? 15;
  const defaultWeatherDate = (weatherHour ?? 12) < weatherThreshold ? today : addDays(today, 1);
  const defaultWeather = findWeatherDay(liveWeatherSnapshot ?? null, defaultWeatherDate)
    ?? ((weatherHour ?? 12) < weatherThreshold ? liveWeatherSnapshot?.today : liveWeatherSnapshot?.tomorrow)
    ?? null;
  const selectedWeather = findWeatherDay(liveWeatherSnapshot ?? null, selectedDate);
  const isSelectedPastAllowed = Boolean(selectedPastWeatherDate);
  const canUseSelectedWeather = Boolean(selectedDate !== today && selectedWeather && (selectedDate >= today || isSelectedPastAllowed));
  const displayWeather = canUseSelectedWeather ? selectedWeather : defaultWeather;
  const weatherLabel = canUseSelectedWeather
    ? `${parseInt(selectedDate.slice(5, 7))}月${parseInt(selectedDate.slice(8, 10))}日`
    : (defaultWeatherDate === today ? '今日' : '明日');
  const weatherDecision = getWeatherDecisionForDay(liveWeatherSnapshot ?? null, displayWeather);
  const noticePill = (() => {
    if (hasRecs && !locked) {
      return { text: '正在修改', cls: 'text-[#3370FF] bg-blue-50' };
    }
    if (hasRecs) {
      return {
        text: selectedIsToday ? '✓ 今天已录入' : '已录入',
        cls:  'text-green-600 bg-green-50',
      };
    }
    if (selectedIsRestDay || restCarryFromYesterday) {
      return { text: '好好休息', cls: 'text-gray-400 bg-gray-100' };
    }
    if (!selectedIsToday) {
      return { text: '未录入', cls: 'text-gray-400 bg-gray-100' };
    }
    if (currentMinutes >= 18 * 60) {
      return { text: '请录入工时！', cls: 'text-amber-600 bg-amber-50 border border-amber-200' };
    }
    if (currentMinutes >= 9 * 60) {
      return { text: '还没下班哦', cls: 'text-gray-400 bg-gray-100' };
    }
    if (currentMinutes >= REST_CARRY_END_MINUTES) {
      return { text: '准备开工', cls: 'text-gray-400 bg-gray-100' };
    }
    return { text: '好好休息', cls: 'text-gray-400 bg-gray-100' };
  })();
  const fontSteps = [
    { zoom: 1,    name: '15px', value: '18px', input: '16px', status: '13px', button: '32px', buttonText: '18px', valueWidth: '48px', statusWidth: '74px', gap: '10px' },
    { zoom: 1.08, name: '15px', value: '18px', input: '16px', status: '13px', button: '31px', buttonText: '18px', valueWidth: '46px', statusWidth: '72px', gap: '7px' },
    { zoom: 1.16, name: '15px', value: '18px', input: '16px', status: '13px', button: '30px', buttonText: '18px', valueWidth: '44px', statusWidth: '70px', gap: '5px' },
    { zoom: 1.24, name: '15px', value: '18px', input: '16px', status: '13px', button: '29px', buttonText: '18px', valueWidth: '42px', statusWidth: '68px', gap: '4px' },
  ][fontLevel] ?? { zoom: 1, name: '15px', value: '18px', input: '16px', status: '13px', button: '32px', buttonText: '18px', valueWidth: '48px', statusWidth: '74px', gap: '10px' };
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
  const attendanceListStyle = {} as CSSProperties;

  // Swipe gesture on the calendar strip to navigate weeks
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const onCalTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const onCalTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0 && canGoNext && !isLoadingWeek) switchWeek(addDays(weekStart, 7));
    if (dx > 0 && !isLoadingWeek)              switchWeek(addDays(weekStart, -7));
  };

  return (
    <div className="min-h-screen bg-[#F0F4FA]">

      {/* ── Week calendar ── */}
      <div className="sticky top-0 bg-white shadow-sm z-40 relative"
        onTouchStart={onCalTouchStart} onTouchEnd={onCalTouchEnd}>

        {/* Week calendar */}
        <div className="flex items-center px-2 pt-2 pb-2">
          <div className="w-9 h-[58px] flex flex-col items-center justify-between">
            <span className="text-[14px] font-bold text-[#3370FF] leading-none">{weekMonth}月</span>
            <button onClick={() => switchWeek(addDays(weekStart, -7))} disabled={isLoadingWeek}
              className="w-9 h-8 flex items-center justify-center text-gray-400 disabled:opacity-40">
              <ChevronLeft size={18} />
            </button>
          </div>
          <div className="flex-1 flex justify-around">
            {weekDays.map(date => {
              const [y, m, d] = date.split('-').map(Number);
              const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
              const label = ['日','一','二','三','四','五','六'][dow];
              const isToday = date === today, isSelected = date === selectedDate, restDay = isConfiguredRestDay(date);
              const isFuture = date > today;
              const dayNum = parseInt(date.slice(8, 10));
              const isFirst = date.slice(8, 10) === '01';
              const hasRecords = hasDayRecords(date);
              const isRestOnly = restDay
                && hasRecords
                && Object.values(weekData[date] ?? {}).every(rec => rec.status === 'holiday');
              const dayLocked = isDayLocked(date);
              return (
                <button key={date} onClick={() => setSelectedDate(date)}
                  className={`w-10 h-[58px] flex flex-col items-center justify-between py-1 rounded-lg transition-all duration-150
                    ${isSelected
                      ? 'bg-[linear-gradient(135deg,#60A5FA_0%,#3370FF_100%)] shadow-sm -translate-y-0.5'
                      : isToday
                        ? 'bg-white shadow-md -translate-y-1'
                        : 'bg-transparent shadow-none translate-y-0'}
                    ${restDay && !isToday && !isFuture ? 'opacity-40' : ''}`}>
                  <span className={`text-[11px] font-medium leading-none
                    ${isFuture ? 'opacity-40' : ''}
                    ${isSelected ? 'text-white' : isToday ? 'text-[#3370FF]' : restDay ? 'text-gray-300' : 'text-gray-400'}`}>
                    {label}
                  </span>
                  <span className={`text-[15px] font-bold w-8 h-8 flex items-center justify-center rounded-full
                    ${isFuture ? 'opacity-40' : ''}
                    ${isSelected ? 'text-white' : isToday ? 'text-[#3370FF]' : 'text-gray-700'}`}>
                    {dayNum}
                  </span>
                  <div className={`h-[14px] flex items-center justify-center mt-0.5 ${isFuture ? 'opacity-40' : ''}`}>
                    {isFirst ? (
                      <span className={`text-[9px] px-1 rounded-full leading-none
                        ${isSelected
                          ? 'border border-white/80 text-white'
                          : dayLocked ? 'bg-[#3370FF] text-white' : 'border border-[#3370FF] text-[#3370FF]'}`}>
                        {parseInt(date.slice(5, 7))}月
                      </span>
                    ) : (
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        isRestOnly
                          ? (isSelected ? 'border border-white bg-transparent' : 'border border-[#3370FF] bg-transparent')
                          : dayLocked
                          ? (isSelected ? 'bg-white' : 'bg-[#3370FF]')
                          : restDay && !hasRecords && !isFuture
                            ? (isSelected ? 'border border-white bg-transparent' : 'border border-[#3370FF] bg-transparent')
                            : 'bg-transparent'
                      }`} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="w-9 h-[58px] flex flex-col items-center justify-end">
            <button onClick={() => switchWeek(addDays(weekStart, 7))} disabled={!canGoNext || isLoadingWeek}
              className="w-9 h-8 flex items-center justify-center text-gray-400 disabled:opacity-40">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

      </div>

      {/* ── Weather strip ── */}
      {displayWeather && (
        <button
          type="button"
          onClick={() => refreshWeather(selectedPastWeatherDate)}
          className={`relative z-0 isolate h-12 w-full overflow-hidden -mt-px text-left ${weatherDecision?.showAnimation ? '' : 'bg-[#F8FAFF]'}`}
        >
          {weatherDecision?.showAnimation && <WeatherBg category={weatherDecision.category} />}
          <div className="relative z-10 h-full flex items-center px-4">
            <div className="flex items-center gap-1.5 min-w-0 text-[12px] font-medium text-gray-500">
              <span className="shrink-0">{getWeatherEmoji(displayWeather.iconDay)}</span>
              <span className="truncate">
                {weatherCity ? `${weatherCity} ` : ''}{weatherLabel} {displayWeather.textDay}・{displayWeather.tempMin}~{displayWeather.tempMax}°C
                {weatherDecision?.tempHint ? `｜${weatherDecision.tempHint}` : ''}
              </span>
            </div>
          </div>
        </button>
      )}

      {/* ── Employee cards ── */}
      <div className="px-3 pt-1 pb-2 overflow-x-hidden" style={attendanceListStyle}>
        <div className="space-y-1.5 origin-top-left" style={attendanceFontStyle}>
          {employees.map((emp, empIdx) => {
            const row      = editRows[emp.id] ?? { hours: '8', status: 'worked', customLabel: '' };
            const isWork   = row.status === 'worked';
            const isCustom = row.status === 'custom';
            const badge    = STATUS_BADGE[row.status];
            const cardBg   = empIdx % 2 === 0 ? 'bg-white' : 'bg-[#F7F9FF]';
            const isCompletionActive = completionWaveDate === selectedDate;
            const rowCompleted = locked && (!isCompletionActive || empIdx <= completionWaveStep);
            const showCompletionWave = locked && isCompletionActive && empIdx <= completionWaveStep;

            return (
              <div key={emp.id} className={`${cardBg} rounded-xl p-3 ring-1 ring-inset ring-[#DCE5F4] [box-shadow:inset_0_-1px_0_rgba(26,58,143,0.06),0_1px_2px_rgba(15,23,42,0.035)]`}>
              <div className="grid grid-cols-[1fr_auto_1fr_22px] items-center gap-[var(--att-row-gap)]">

                {/* Name */}
                <div className="min-w-0">
                  <span className={`${emp.name.length === 2 ? 'inline-block w-[3em] text-justify [text-align-last:justify]' : 'block truncate'} text-[var(--att-name-size)] font-semibold text-gray-800`}>{emp.name}</span>
                </div>

                {/* Hours */}
                <div className="grid grid-cols-[var(--att-button-size)_var(--att-value-width)_var(--att-button-size)] items-center justify-items-center shrink-0">
                  <button onClick={() => locked ? showToast('已锁定，如要修改请点右下方修改按钮') : adjustHours(emp.id, -0.5)} disabled={!isWork}
                    className={`w-[var(--att-button-size)] h-[var(--att-button-size)] rounded-full font-bold text-[var(--att-button-text-size)] flex items-center justify-center transition-colors
                      ${!isWork || rowCompleted ? 'bg-gray-50 text-gray-200' : 'bg-[#E8EEF8] text-[#1A3A8F]'}`}>−</button>

                  {rowCompleted ? (
                    <span className="w-[var(--att-value-width)] text-center text-[var(--att-value-size)] font-bold text-[#3370FF]">
                      {isWork && row.hours ? row.hours : '—'}
                    </span>
                  ) : (
                    <input type="text" inputMode="decimal"
                      value={isWork ? row.hours : ''} disabled={!isWork} readOnly={locked}
                      onChange={e => setHours(emp.id, e.target.value)}
                      className="w-full p-0 text-center text-[var(--att-input-size)] font-bold text-[#1A3A8F] border-0 bg-transparent focus:outline-none disabled:text-gray-300"
                      placeholder="—" />
                  )}

                  <button onClick={() => locked ? showToast('已锁定，如要修改请点右下方修改按钮') : adjustHours(emp.id, 0.5)} disabled={!isWork}
                    className={`w-[var(--att-button-size)] h-[var(--att-button-size)] rounded-full font-bold text-[var(--att-button-text-size)] flex items-center justify-center transition-colors
                      ${!isWork || rowCompleted ? 'bg-gray-50 text-gray-200' : 'bg-[#E8EEF8] text-[#1A3A8F]'}`}>＋</button>
                </div>

                {/* Status */}
                <div className="flex items-center">
                  {rowCompleted ? (
                    isCustom ? (
                      <span className="whitespace-nowrap text-[var(--att-status-size)] font-semibold text-purple-500 bg-purple-50 px-2.5 py-1 rounded-lg">
                        {row.customLabel || '—'}
                      </span>
                    ) : badge ? (
                      <span className={`whitespace-nowrap text-[var(--att-status-size)] font-semibold px-2.5 py-1 rounded-lg ${badge.cls}`}>{badge.text}</span>
                    ) : (
                      <span className="whitespace-nowrap text-[var(--att-status-size)] text-gray-400">—</span>
                    )
                  ) : isCustom ? (
                    <div className="flex items-center gap-1">
                      <input type="text" maxLength={2} autoFocus
                        value={row.customLabel}
                        readOnly={locked}
                        onChange={e => setCustomLabel(emp.id, e.target.value)}
                        className="w-12 text-center text-[var(--att-status-size)] text-gray-700 bg-[#F0F4FA] border-0 rounded-lg px-1 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#3370FF]" />
                      <button onClick={() => setStatus(emp.id, 'worked')}
                        className="text-gray-300 hover:text-gray-400 text-[18px] leading-none px-0.5 shrink-0">×</button>
                    </div>
                  ) : (
                    <div ref={openDropdownId === emp.id ? statusMenuRef : null} className="relative w-full">
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => setOpenDropdownId(current => current === emp.id ? null : emp.id)}
                        className="flex h-9 w-full items-center justify-between gap-1.5 rounded-xl border border-[#DCE5F4] bg-[#F6F8FC] px-2.5 text-[var(--att-status-size)] font-semibold text-gray-600 shadow-[inset_0_-1px_0_rgba(26,58,143,0.05)] transition focus:outline-none focus:ring-2 focus:ring-[#3370FF]/20 disabled:opacity-60"
                      >
                        <span className="truncate">{STATUS_OPTIONS.find(o => o.value === row.status)?.label ?? '正常'}</span>
                        <ChevronDown size={12} className={`shrink-0 text-gray-400 transition-transform ${openDropdownId === emp.id ? 'rotate-180 text-[#3370FF]' : ''}`} />
                      </button>
                      {openDropdownId === emp.id && (
                        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-36 overflow-hidden rounded-2xl border border-[#DDE6F3] bg-white py-1.5 shadow-xl shadow-slate-200/90">
                          {STATUS_OPTIONS.map(option => {
                            const isActive = option.value === row.status;
                            const isGlobalAction = option.value === 'all_holiday';
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => { setOpenDropdownId(null); setStatus(emp.id, option.value); }}
                                className={`flex h-10 w-full items-center justify-between px-3.5 text-left text-[13px] font-semibold transition
                                  ${isGlobalAction ? 'mt-1 border-t border-emerald-100 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100' : option.value === 'absent' ? 'text-red-500' : 'text-gray-700'}
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

                <span className="w-[22px] h-[22px] shrink-0 flex items-center justify-center">
                  {rowCompleted ? (
                    showCompletionWave ? (
                      <span
                        className="completion-wave-check"
                      >
                        <Check size={14} strokeWidth={3.2} />
                      </span>
                    ) : (
                      <Lock size={12} className="text-gray-200" />
                    )
                  ) : null}
                </span>

              </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Action bar (between zones) ── */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-1.5 pb-3">
        <div className="flex h-8 items-center gap-1.5 min-w-0">
          {locked ? (
            <><Lock size={13} className="text-gray-400" /><span className="text-[14px] font-semibold leading-none text-gray-500">{displayDate}</span></>
          ) : hasRecs ? (
            <>
              <button
                type="button"
                onClick={handleClearDay}
                disabled={isSaving}
                className="ml-1 inline-flex h-7 items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-2 text-[12px] font-semibold text-red-500 disabled:opacity-60"
              >
                <Trash2 size={12} />
                清空
              </button>
            </>
          ) : (
            <span className="text-[14px] font-semibold leading-none text-gray-500">{displayDate}</span>
          )}
        </div>
        <span className={`inline-flex h-8 items-center justify-center whitespace-nowrap rounded-full px-4 text-[13px] font-semibold leading-none ${noticePill.cls}`}>
          {noticePill.text}
        </span>
        <div className="flex justify-end">
          {locked
            ? <button onClick={handleUnlock} disabled={isSaving}
                className="h-8 min-w-[64px] whitespace-nowrap bg-white border border-gray-200 text-gray-700 text-[14px] font-semibold leading-none rounded-xl shadow-sm disabled:opacity-60">
                修改
              </button>
            : <button onClick={handleSave} disabled={isSaving}
                className="h-8 min-w-[72px] whitespace-nowrap bg-[#3370FF] text-white text-[14px] font-semibold leading-none rounded-xl shadow-sm disabled:opacity-60">
                {isSaving ? '…' : '保存'}
              </button>
          }
        </div>
      </div>

      {/* ── Missed date reminder ── */}
      {reminderDate && (
        <div className="mx-3 mb-1 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[15px]">⚠️</span>
            <span className="text-[13px] font-semibold text-amber-700">
              {new Date(reminderDate + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} 未录入
            </span>
          </div>
          <button onClick={() => goToDate(reminderDate)}
            disabled={isLoadingWeek}
            className="h-8 px-4 bg-amber-500 text-white text-[13px] font-semibold rounded-xl disabled:opacity-60">
            补录
          </button>
        </div>
      )}

      {/* ── Weekly summary table ── */}
      <div className="bg-[#E4ECF7] pt-2 pb-6" onTouchStart={onCalTouchStart} onTouchEnd={onCalTouchEnd}>
        <div className="mx-3 mt-2 bg-white rounded-2xl shadow-sm overflow-hidden">
          <div>
            <table className="w-full text-[12px] leading-[1.35]" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '52px' }} />
                {weekDays.map(d => <col key={d} style={{ width: '30px' }} />)}
                <col style={{ width: '38px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="bg-[#F8FAFF] text-center py-2.5 text-gray-600 font-semibold whitespace-nowrap border-b border-r border-gray-100">
                    姓名
                  </th>
                  {weekDays.map((date, i) => {
                    const isSelected = date === selectedDate, restDay = isConfiguredRestDay(date), isLast = i === 6;
                    const dayNum = parseInt(date.slice(8, 10));
                    return (
                      <th key={date} className={`text-center py-2.5 font-semibold border-b border-gray-100 ${!isLast ? 'border-r' : ''}
                        ${isSelected ? 'bg-blue-50 text-[#3370FF]' : restDay ? 'bg-[#F8FAFF] text-gray-300' : 'bg-[#F8FAFF] text-gray-600'}`}>
                        <div>{DAY_LABELS[i]}</div>
                        <div>{dayNum}</div>
                      </th>
                    );
                  })}
                  <th className="text-center py-2.5 w-12 px-2 bg-[#F8FAFF] text-gray-600 font-semibold border-b border-l border-gray-100">合计</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, rowIdx) => {
                  const isLastRow = rowIdx === employees.length - 1;
                  const totalHours = weekDays.reduce((sum, date) => {
                    const rec = weekData[date]?.[emp.id];
                    return rec?.status === 'worked' && rec.hours ? sum + parseFloat(rec.hours) : sum;
                  }, 0);
                  return (
                    <tr key={emp.id}>
                      <td className={`bg-white py-3 text-center text-gray-800 font-semibold whitespace-nowrap border-r border-gray-100 ${!isLastRow ? 'border-b border-gray-50' : ''}`}>
                        {emp.name.slice(-2)}
                      </td>
                      {weekDays.map((date, i) => {
                        const rec = weekData[date]?.[emp.id];
                        const isSelected = date === selectedDate, isLast = i === 6;
                        const defaultRest = isConfiguredRestDay(date) && !rec && date <= today;
                        return (
                          <td key={date} className={`text-center py-3
                            ${!isLast ? 'border-r border-gray-100' : ''}
                            ${!isLastRow ? 'border-b border-gray-50' : ''}
                            ${isSelected ? 'bg-blue-50/40' : ''}
                            ${defaultRest ? 'opacity-70' : ''}`}>
                            {renderSummaryCell(rec, defaultRest)}
                          </td>
                        );
                      })}
                      <td className={`text-center py-3 px-2 font-bold text-[#3370FF] border-l border-gray-100 ${!isLastRow ? 'border-b border-gray-50' : ''}`}>
                        {totalHours > 0
                          ? (totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1))
                          : <span className="text-gray-300 font-normal">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[13px] px-4 py-2 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
