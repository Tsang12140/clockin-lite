'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Download, ChevronRight as ArrowRight } from 'lucide-react';
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

  const activeData = filter === 'active' ? data.filter(e => e.status === 'active') : data;
  const totalHours = activeData.reduce((s, e) => s + e.totalHours, 0);
  const totalWage  = activeData.reduce((s, e) => s + e.totalWage,  0);

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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] text-gray-400 mb-0.5">总工时</div>
            <div className="text-[22px] font-bold text-[#1A3A8F]">{formatHours(totalHours)}<span className="text-[13px] font-normal ml-1">小时</span></div>
          </div>
          <div>
            <div className="text-[11px] text-gray-400 mb-0.5">总工资</div>
            <div className="text-[22px] font-bold text-[#1A3A8F]">¥{formatMoney(totalWage)}</div>
          </div>
        </div>
      </div>

      {/* Employee rows */}
      <div className="px-3 mt-2 space-y-2 md:px-0">
        {activeData.map(emp => (
          <Link key={emp.id} href={`/salary/${emp.id}?year=${year}&month=${month}`}
            className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold text-gray-800">{emp.name}</div>
              <div className="text-[12px] text-gray-400 mt-0.5">{emp.recordCount} 天 · {formatHours(emp.totalHours)} 小时</div>
            </div>
            <div className="bg-[#3370FF] text-white rounded-xl px-3 py-1.5 text-right shrink-0">
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
