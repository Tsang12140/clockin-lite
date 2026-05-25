'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UserPlus, Briefcase, Clock, ChevronRight, Eye, EyeOff } from 'lucide-react';

interface Employee {
  id: number;
  name: string;
  gender: string | null;
  phone: string | null;
  status: string | null;
  currentHourlyRate: string | null;
  positionName: string | null;
  hireDate: string | null;
  leaveDate: string | null;
  notes: string | null;
}

export default function EmployeeList({ employees }: { employees: Employee[] }) {
  const [filter, setFilter] = useState<'active' | 'inactive'>('active');
  const [showRate, setShowRate] = useState(false);

  const filtered = employees.filter(e => e.status === filter);

  return (
    <div className="min-h-screen bg-[#F0F4FA]">
      <div className="mx-auto max-w-2xl md:px-6 md:py-5">
        {/* Header */}
        <div className="bg-white shadow-sm px-4 pt-4 pb-3 md:rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-semibold text-[#1A3A8F]">员工管理</h1>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowRate(v => !v)} className="p-1.5 text-gray-400">
                {showRate ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <Link href="/employees/new" className="flex items-center gap-1.5 bg-[#3370FF] text-white text-sm font-medium px-3 py-1.5 rounded-xl">
                <UserPlus size={15} />
                新增
              </Link>
            </div>
          </div>
          <div className="seg-ctrl">
            <button className={filter === 'active' ? 'active' : ''} onClick={() => setFilter('active')}>
              在职 {employees.filter(e => e.status === 'active').length}
            </button>
            <button className={filter === 'inactive' ? 'active' : ''} onClick={() => setFilter('inactive')}>
              离职 {employees.filter(e => e.status === 'inactive').length}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="px-3 pt-3 space-y-2 md:px-0">
          {filtered.length === 0 && (
            <div className="text-center text-gray-400 py-12 text-sm">暂无记录</div>
          )}
          {filtered.map(emp => (
            <Link key={emp.id} href={`/employees/${emp.id}`} className="block bg-white rounded-2xl shadow-sm p-4 active:opacity-70">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-[18px] font-bold
                  ${emp.status === 'inactive' ? 'bg-gray-100 text-gray-400' : 'bg-[#EEF2FF] text-[#3370FF]'}`}>
                  {emp.name.slice(-1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`${emp.name.length === 2 ? 'inline-block w-[3em] text-justify [text-align-last:justify]' : 'block truncate'} text-[17px] font-semibold text-gray-800`}>
                      {emp.name}
                    </span>
                    {emp.status === 'inactive' && (
                      <span className="text-[11px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-medium">离职</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-[12px] text-gray-500">
                      <Briefcase size={12} />
                      {emp.positionName ?? '—'}
                    </span>
                    <span className="flex items-center gap-1 text-[12px] text-gray-500">
                      <Clock size={12} />
                      {showRate ? `${emp.currentHourlyRate ?? '—'} 元/时` : '*** 元/时'}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    入职 {emp.hireDate ?? '—'}
                    {emp.leaveDate && <span className="ml-2">离职 {emp.leaveDate}</span>}
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
