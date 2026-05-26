'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, ImageDown } from 'lucide-react';
import { effectiveRate } from '@/lib/utils';
import type { WorkScheduleConfig } from '@/db/schema';
import type { OvertimeMultipliers } from '@/lib/overtime';
import { calculateDailyWage } from '@/lib/overtime';

interface AttRec { workDate: string | null; hours: string | null; status: string | null; statusLabel: string | null }
interface RateHist { effectiveDate: string | null; rate: string | null }
interface Emp { id: number; name: string; currentHourlyRate: string | null }
interface EmpStub { id: number; name: string }

const DOW_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function SpacedName({ name }: { name: string }) {
  const chars = Array.from(name.trim());
  if (chars.length === 2) {
    return (
      <span className="inline-flex w-[3.05em] justify-between">
        <span>{chars[0]}</span>
        <span>{chars[1]}</span>
      </span>
    );
  }
  return <>{name}</>;
}

export default function PayslipView({
  emp,
  records,
  rateHistory,
  year,
  month,
  allEmps,
  workSchedule,
  legalHolidayDates,
  adjustedWorkdayDates,
  overtimeMultipliers,
}: {
  emp: Emp;
  records: AttRec[];
  rateHistory: RateHist[];
  year: number;
  month: number;
  allEmps: EmpStub[];
  workSchedule: WorkScheduleConfig;
  legalHolidayDates: string[];
  adjustedWorkdayDates: string[];
  overtimeMultipliers: OvertimeMultipliers;
}) {
  const router  = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  const empIdx  = allEmps.findIndex(e => e.id === emp.id);
  const prevEmp = empIdx > 0 ? allEmps[empIdx - 1] : null;
  const nextEmp = empIdx < allEmps.length - 1 ? allEmps[empIdx + 1] : null;
  const goEmp   = (id: number) => router.push(`/salary/${id}?year=${year}&month=${month}`);

  // Record map by day number
  const recByDay: Record<number, AttRec> = {};
  for (const r of records) {
    if (!r.workDate) continue;
    recByDay[parseInt(r.workDate.slice(8, 10))] = r;
  }

  const lastDay  = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Sun
  const offset   = (firstDow + 6) % 7; // Mon=0
  const weeks    = Math.ceil((offset + lastDay) / 7);

  // Prev / next month navigation
  const prevM = month === 1  ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const nextM = month === 12 ? { year: year + 1, month: 1  } : { year, month: month + 1 };
  const now   = new Date();
  const nextIsFuture = nextM.year > now.getFullYear() ||
    (nextM.year === now.getFullYear() && nextM.month > now.getMonth() + 1);
  const navTo = (y: number, m: number) => router.push(`/salary/${emp.id}?year=${y}&month=${m}`);

  // Salary calculation
  const ratesForCalc = rateHistory
    .filter(h => h.effectiveDate && h.rate)
    .map(h => ({ effectiveDate: h.effectiveDate!, rate: h.rate! }));
  const currentRate = parseFloat(String(emp.currentHourlyRate ?? 0));

  let workedDays = 0, specialDays = 0, totalHours = 0, totalWage = 0;
  const legalHolidayDateSet = new Set(legalHolidayDates);
  const adjustedWorkdayDateSet = new Set(adjustedWorkdayDates);
  const rateSegMap: Record<string, { label: string; rate: number; multiplier: number; hours: number; wage: number }> = {};

  for (let d = 1; d <= lastDay; d++) {
    const rec = recByDay[d];
    if (!rec?.status) continue;
    if (rec.status === 'worked') {
      workedDays++;
      const h = rec.hours ? parseFloat(String(rec.hours)) : 0;
      if (h <= 0) continue;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const rate = effectiveRate(ratesForCalc, dateStr) ?? currentRate;
      const wage = calculateDailyWage({
        date: dateStr,
        hours: h,
        rate,
        workSchedule,
        legalHolidayDates: legalHolidayDateSet,
        adjustedWorkdayDates: adjustedWorkdayDateSet,
        multipliers: overtimeMultipliers,
      });
      totalHours += h;
      totalWage  += wage.totalWage;
      for (const segment of wage.segments) {
        const key = `${segment.kind}-${rate.toFixed(2)}-${segment.multiplier.toFixed(2)}`;
        rateSegMap[key] = {
          label: segment.label,
          rate,
          multiplier: segment.multiplier,
          hours: (rateSegMap[key]?.hours ?? 0) + segment.hours,
          wage: (rateSegMap[key]?.wage ?? 0) + segment.wage,
        };
      }
    } else {
      specialDays++;
    }
  }

  const salarySegs = Object.values(rateSegMap)
    .sort((a, b) => a.rate - b.rate || a.multiplier - b.multiplier || a.label.localeCompare(b.label));

  const fmtH = (h: number) => h % 1 === 0 ? String(h) : h.toFixed(1);

  const saveImage = async () => {
    if (!cardRef.current || saving) return;
    setSaving(true);
    try {
      const { toBlob } = await import('html-to-image');
      const blob = await toBlob(cardRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
      if (!blob) throw new Error('图片生成为空，请重试');
      const filename = `${emp.name}_${year}年${month}月工资条.png`;

      // HTTPS: try Web Share API (Android/iOS → saves to gallery)
      try {
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          return;
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return;
      }

      // Fallback: blob URL download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert('保存失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F4FA]">
      <div className="max-w-2xl mx-auto md:px-6 md:py-5">

      {/* Header (outside screenshot) */}
      <div className="bg-white shadow-sm px-4 pt-5 pb-4 flex items-center md:rounded-2xl">
        <button onClick={() => router.back()} className="p-1 mr-3 text-gray-400">
          <ChevronLeft size={20} />
        </button>
        <h1 className="flex-1 text-[17px] font-semibold text-[#1A3A8F]">工资条</h1>
        <button onClick={saveImage} disabled={saving}
          className="flex items-center gap-1.5 text-[14px] text-[#3370FF] font-medium disabled:opacity-50">
          <ImageDown size={16} />
          {saving ? '生成中…' : '保存图片'}
        </button>
      </div>

      {/* Payslip card — screenshot target */}
      <div className="px-4 pt-4 pb-24 md:px-0">
        <div ref={cardRef} className="bg-white rounded-2xl p-5">

          {/* ① Identity + navigation */}
          <div className="text-center mb-4">
            {/* Employee switching */}
            <div className="grid grid-cols-[32px_minmax(0,1fr)_32px] items-center gap-4 w-64 max-w-full mx-auto mb-2">
              <button onClick={() => prevEmp && goEmp(prevEmp.id)} disabled={!prevEmp}
                className="w-8 h-8 rounded-full bg-[#F0F4FA] flex items-center justify-center text-[#3370FF] active:bg-[#E8EEF8] disabled:opacity-25">
                <ChevronLeft size={18} />
              </button>
              <div className="min-w-0 truncate text-[26px] font-bold text-[#1A3A8F]">{emp.name}</div>
              <button onClick={() => nextEmp && goEmp(nextEmp.id)} disabled={!nextEmp}
                className="w-8 h-8 rounded-full bg-[#F0F4FA] flex items-center justify-center text-[#3370FF] active:bg-[#E8EEF8] disabled:opacity-25">
                <ChevronRight size={18} />
              </button>
            </div>
            {/* Month switching */}
            <div className="grid grid-cols-[28px_minmax(0,1fr)_28px] items-center gap-4 w-44 max-w-full mx-auto">
              <button onClick={() => navTo(prevM.year, prevM.month)}
                className="w-7 h-7 rounded-full bg-[#F0F4FA] flex items-center justify-center text-gray-400 active:bg-[#E8EEF8]">
                <ChevronLeft size={15} />
              </button>
              <div className="min-w-0 text-[16px] font-semibold text-gray-400">{year}年{month}月</div>
              <button onClick={() => navTo(nextM.year, nextM.month)} disabled={nextIsFuture}
                className="w-7 h-7 rounded-full bg-[#F0F4FA] flex items-center justify-center text-gray-400 active:bg-[#E8EEF8] disabled:opacity-25">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          <div className="h-px bg-gray-100 mb-3" />

          {/* ② Attendance calendar */}
          <div className="mb-3">
            <div className="grid grid-cols-7 mb-1">
              {DOW_LABELS.map(l => (
                <div key={l} className="text-center text-[10px] text-gray-400 font-medium py-0.5">{l}</div>
              ))}
            </div>
            {Array.from({ length: weeks }, (_, w) => (
              <div key={w} className="grid grid-cols-7 gap-0.5 mb-0.5">
                {Array.from({ length: 7 }, (_, dow) => {
                  const day = w * 7 + dow - offset + 1;
                  if (day < 1 || day > lastDay) return <div key={dow} className="aspect-square" />;
                  const rec    = recByDay[day];
                  const status = rec?.status;
                  const hours  = rec?.hours ? parseFloat(String(rec.hours)) : null;

                  const STATUS_SHORT: Record<string, string> = { leave:'请假', sick:'病假', holiday:'放假', absent:'旷工', custom:'特殊' };

                  let cellCls = 'bg-gray-50', numCls = 'text-gray-300', bottom = null;
                  if (status === 'worked' && hours) {
                    cellCls = 'bg-[#EBF0FF]';
                    numCls  = 'text-[#3370FF]';
                    bottom  = <span className="text-[10px] font-bold text-[#3370FF] leading-none">{fmtH(hours)}</span>;
                  } else if (status === 'absent') {
                    cellCls = 'bg-red-50';
                    numCls  = 'text-red-400';
                    bottom  = <span className="text-[9px] font-bold text-red-400 leading-none">旷工</span>;
                  } else if (status && status !== 'worked') {
                    cellCls = 'bg-[#FFF8E1]';
                    numCls  = 'text-orange-400';
                    const lbl = rec?.statusLabel ?? STATUS_SHORT[status] ?? '特殊';
                    bottom  = <span className="text-[9px] font-bold text-orange-400 leading-none">{lbl.slice(0, 2)}</span>;
                  }

                  return (
                    <div key={dow} className={`aspect-square rounded ${cellCls} flex flex-col items-center justify-center gap-0.5`}>
                      <span className={`text-[9px] leading-none ${numCls}`}>{day}</span>
                      {bottom ?? <span className="h-2.5" />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="h-px bg-gray-100 mb-3" />

          {/* ③ Summary */}
          <div className={`flex ${specialDays > 0 ? 'justify-around' : 'justify-center gap-12'} mb-3`}>
            <div className="text-center">
              <div className="text-[11px] text-gray-400">出勤天数</div>
              <div className="text-[22px] font-bold text-[#1A3A8F]">{workedDays}</div>
              <div className="text-[10px] text-gray-400">天</div>
            </div>
            <div className="text-center">
              <div className="text-[11px] text-gray-400">总工时</div>
              <div className="text-[22px] font-bold text-[#1A3A8F]">{fmtH(totalHours)}</div>
              <div className="text-[10px] text-gray-400">小时</div>
            </div>
            {specialDays > 0 && (
              <div className="text-center">
                <div className="text-[11px] text-gray-400">特殊天数</div>
                <div className="text-[22px] font-bold text-gray-400">{specialDays}</div>
                <div className="text-[10px] text-gray-400">天</div>
              </div>
            )}
          </div>

          <div className="h-px bg-gray-100 mb-3" />

          {/* ④ Salary calculation */}
          <div className="text-center">
            {salarySegs.length === 0 ? (
              <div className="text-[13px] text-gray-400">本月暂无出勤记录</div>
            ) : (
              salarySegs.map((seg, i) => (
                <div key={i} className="text-[13px] text-gray-500 mb-1">
                  {seg.label} {fmtH(seg.hours)} 小时 × ¥{seg.rate.toFixed(2)}
                  {seg.multiplier !== 1 ? ` × ${seg.multiplier.toFixed(2)}` : ''} = ¥{seg.wage.toFixed(2)}
                </div>
              ))
            )}
            <div className="text-[26px] font-bold text-[#1A3A8F] mt-2">
              ¥{totalWage.toFixed(2)}
            </div>
          </div>

        </div>
      </div>
      </div>
    </div>
  );
}
