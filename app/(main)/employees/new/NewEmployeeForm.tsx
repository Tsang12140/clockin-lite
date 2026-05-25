'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createEmployee } from './actions';

export default function NewEmployeeForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', gender: 'female', phone: '', idCard: '',
    positionName: '',
    hireDate: new Date().toISOString().slice(0, 10),
    hourlyRate: '',
    notes: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('请填写姓名'); return; }
    if (!form.hourlyRate)  { setError('请填写初始时薪'); return; }
    startTransition(async () => {
      const r = await createEmployee(form);
      if (r.ok) router.push('/employees');
      else setError('创建失败，请重试');
    });
  };

  const input = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-[12px] text-gray-400 mb-1">{label}</label>
      <input type={type} placeholder={placeholder} value={String(form[key])}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="w-full h-11 px-3 rounded-xl border border-gray-200 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#3370FF]/40 focus:border-[#3370FF]"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F0F4FA]">
      <div className="mx-auto max-w-2xl md:px-6 md:py-5">
        <div className="bg-white shadow-sm px-4 pt-4 pb-3 flex items-center justify-between md:rounded-2xl">
          <button onClick={() => router.back()} className="p-1 text-gray-400">
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-[16px] font-semibold text-[#1A3A8F]">新增员工</h1>
          <div className="w-8" />
        </div>

      <form onSubmit={handleSubmit} className="px-3 pt-3 space-y-3 md:px-0">
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          {input('姓名 *', 'name', 'text', '请输入姓名')}
          <div>
            <label className="block text-[12px] text-gray-400 mb-1">性别</label>
            <div className="seg-ctrl">
              {[{v:'female',l:'女'},{v:'male',l:'男'}].map(({v,l}) => (
                <button type="button" key={v} className={form.gender===v?'active':''}
                  onClick={() => setForm(f=>({...f,gender:v}))}>{l}</button>
              ))}
            </div>
          </div>
          {input('电话', 'phone', 'tel', '可选')}
          {input('身份证', 'idCard', 'text', '可选')}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          {input('岗位', 'positionName', 'text', '可选，如：收银员')}
          {input('初始时薪（元/时）*', 'hourlyRate', 'number', '')}
          {input('入职日期', 'hireDate', 'date')}
          {input('备注', 'notes', 'text', '可选')}
        </div>

        {error && <p className="text-[13px] text-red-500 px-1">{error}</p>}

        <button type="submit" disabled={isPending}
          className="w-full h-12 bg-[#3370FF] text-white font-semibold rounded-2xl disabled:opacity-60">
          {isPending ? '创建中…' : '创建员工'}
        </button>
      </form>
      </div>
    </div>
  );
}
