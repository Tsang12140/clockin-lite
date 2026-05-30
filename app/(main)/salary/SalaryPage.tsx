'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Download, ChevronRight as ArrowRight, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { formatMoney, formatHours } from '@/lib/utils';

interface EmployeeSalary {
  id: number;
  name: string;
  status: string | null;
  currentHourlyRate: string | null;
  positionName: string | null;
  totalHours: number;
  totalWage: number;
  recordCount: number;
}

function SpacedName({ name }: { name: string }) {
  const chars = Array.from(name.trim());
  if (chars.length === 2) {
    return <span>{chars[0]}{'　'}{chars[1]}</span>;
  }
  return <>{name}</>;
}

export default function SalaryPage({
  data,
  year,
  month,
}: {
  data: EmployeeSalary[];
  year: number;
  month: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'active'>('active');
  const [summary, setSummary] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);

  const activeData = filter === 'active' ? data.filter(e => e.status === 'active') : data;
  const totalHours = activeData.reduce((s, e) => s + e.totalHours, 0);
  const totalWage  = activeData.reduce((s, e) => s + e.totalWage,  0);
  const avgRate = totalHours > 0 ? totalWage / totalHours : 0;

  const askPageQuestion = () => {
    window.dispatchEvent(new CustomEvent('clockin-ai-page-question', {
      detail: { message: '我对这个工资页面有疑问' },
    }));
  };

  const generateMonthlySummary = async () => {
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const response = await fetch('/api/ai/monthly-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      });
      const result = await response.json() as { ok?: boolean; summary?: string; message?: string };
      if (!response.ok || result.ok === false) {
        throw new Error(result.message || '月度总结生成失败。');
      }
      setSummary(result.summary || '');
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : '月度总结生成失败。');
    } finally {
      setSummaryLoading(false);
    }
  };

  const navigate = (dy: number) => {
    let m = month + dy;
    let y = year;
    if (m < 1)  { m = 12; y--; }
    if (m > 12) { m = 1;  y++; }
    router.push(`/salary?year=${y}&month=${m}`);
  };

  return (
    <div className="min-h-screen bg-[#F0F4FA]">
      <div className="max-w-2xl mx-auto md:px-6 md:py-5">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 pt-4 pb-3 md:rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="p-1.5 text-gray-400">
              <ChevronLeft size={20} />
            </button>
            <h1 className="text-[16px] font-semibold text-[#1A3A8F]">
              {year}年{month}月 工资表
            </h1>
            <button onClick={() => navigate(1)} className="p-1.5 text-gray-400">
              <ChevronRight size={20} />
            </button>
          </div>
          <a
            href={`/api/export/salary?year=${year}&month=${month}`}
            download
            className="flex items-center gap-1 text-[12px] text-gray-400 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:text-[#3370FF] hover:border-[#3370FF]/40 transition-colors"
          >
            <Download size={13} />
            导出
          </a>
        </div>
        <div className="seg-ctrl">
          <button className={filter === 'active' ? 'active' : ''} onClick={() => setFilter('active')}>在职员工</button>
          <button className={filter === 'all'    ? 'active' : ''} onClick={() => setFilter('all')}>全部</button>
        </div>
      </div>

      {/* Summary card */}
      <div className="mx-3 mt-3 bg-white rounded-2xl shadow-sm p-4 md:mx-0">
        <div className="grid grid-cols-[minmax(0,1fr)_132px_16px] items-center gap-3">
          <div className="min-w-0">
            <div className="text-[11px] text-gray-400 mb-0.5">总工时</div>
            <div className="text-[22px] font-bold text-[#1A3A8F]">{formatHours(totalHours)}<span className="text-[13px] font-normal ml-1">小时</span></div>
            {totalHours > 0 && (
              <div className="mt-1 text-[12px] font-medium text-gray-400">
                {formatHours(totalHours)} 小时 × ¥{formatMoney(avgRate)}/h
              </div>
            )}
          </div>
          <div className="w-[132px] rounded-xl bg-[#F5F8FF] px-3 py-2 text-center">
            <div className="text-[11px] text-gray-400 mb-0.5">总工资</div>
            <div className="text-[18px] font-bold leading-tight text-[#1A3A8F]">¥{formatMoney(totalWage)}</div>
          </div>
          <div aria-hidden className="w-4" />
        </div>
        <button
          type="button"
          onClick={askPageQuestion}
          className="mt-3 inline-flex h-7 items-center rounded-full bg-[#F0F4FA] px-3 text-[12px] font-semibold text-[#3370FF] active:bg-[#E6EEFF]"
        >
          我有疑问
        </button>
        <button
          type="button"
          onClick={generateMonthlySummary}
          disabled={summaryLoading}
          className="ml-2 mt-3 inline-flex h-7 items-center gap-1.5 rounded-full bg-[#3370FF] px-3 text-[12px] font-semibold text-white shadow-sm disabled:opacity-60"
        >
          {summaryLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          AI 月度总结
        </button>
        <div className="mt-2 text-[11px] leading-5 text-gray-400">
          点击生成会把本月工资汇总发送给已配置的 AI 服务，用于生成本页总结。
        </div>
      </div>

      {(summary || summaryError) && (
        <div className="mx-3 mt-3 rounded-2xl bg-white p-4 shadow-sm md:mx-0">
          <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold text-[#1A3A8F]">
            <Sparkles size={16} />
            AI 月度总结
          </div>
          {summaryError ? (
            <div className="rounded-xl bg-red-50 px-3 py-2.5 text-[12px] leading-5 text-red-600">
              {summaryError}
            </div>
          ) : (
            <div className="whitespace-pre-wrap rounded-xl bg-[#F5F8FF] px-3 py-3 text-[13px] leading-6 text-gray-700">
              {summary}
            </div>
          )}
        </div>
      )}

      {/* Employee rows */}
      <div className="px-3 mt-2 space-y-2 md:px-0">
        {activeData.map(emp => (
          <Link key={emp.id} href={`/salary/${emp.id}?year=${year}&month=${month}`}
            className="grid grid-cols-[minmax(0,1fr)_132px_16px] items-center gap-3 bg-white rounded-2xl shadow-sm p-4">
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold text-gray-800"><SpacedName name={emp.name} /></div>
              <div className="text-[12px] text-gray-400 mt-0.5">
                {emp.recordCount} 天 · {formatHours(emp.totalHours)} 小时
                {emp.totalHours > 0 ? ` × ¥${formatMoney(emp.totalWage / emp.totalHours)}/h` : ''}
              </div>
            </div>
            <div className="w-[132px] bg-[#3370FF] text-white rounded-xl px-3 py-1.5 text-center">
              <div className="text-[16px] font-bold leading-tight">¥{formatMoney(emp.totalWage)}</div>
            </div>
            <ArrowRight size={16} className="text-gray-300 shrink-0" />
          </Link>
        ))}
      </div>

      <div className="h-4" />
      </div>
    </div>
  );
}
