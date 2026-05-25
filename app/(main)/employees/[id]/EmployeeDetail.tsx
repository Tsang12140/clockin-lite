'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Eye, EyeOff, Plus, TrendingUp, X } from 'lucide-react';
import { updateEmployee, addRateHistory, markInactive, updateEmployeeAliases } from './actions';

interface Emp {
  id: number; name: string; gender: string | null; phone: string | null;
  idCard: string | null; positionId: number | null; positionName: string | null;
  status: string | null; hireDate: string | null; leaveDate: string | null;
  currentHourlyRate: string | null; notes: string | null;
}
interface RateHist { id: number; rate: string; effectiveDate: string; notes: string | null }

function maskIdCard(id: string) {
  return id.replace(/^(.{6}).+(.{4})$/, '$1********$2');
}

export default function EmployeeDetail({
  emp, rateHistory, aliases,
}: { emp: Emp; rateHistory: RateHist[]; aliases: string[] }) {
  const router = useRouter();
  const [showId, setShowId]       = useState(false);
  const [showRates, setShowRates] = useState(false);
  const [editing, setEditing]     = useState(false);
  const [showRateForm, setShowRateForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast]         = useState('');
  const [aliasEditing, setAliasEditing] = useState(false);
  const [aliasDrafts, setAliasDrafts] = useState(aliases);
  const [aliasInput, setAliasInput] = useState('');

  const [form, setForm] = useState({
    name: emp.name, gender: emp.gender ?? 'female', phone: emp.phone ?? '',
    idCard: emp.idCard ?? '', positionName: emp.positionName ?? '',
    hireDate: emp.hireDate ?? '', leaveDate: emp.leaveDate ?? '', notes: emp.notes ?? '',
  });
  const [newRate, setNewRate] = useState({ rate: '', effectiveDate: '', notes: '' });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000); };

  const handleSave = () => startTransition(async () => {
    const r = await updateEmployee(emp.id, form);
    if (r.ok) { showToast('保存成功'); setEditing(false); router.refresh(); }
    else showToast('保存失败');
  });

  const handleAddRate = () => startTransition(async () => {
    if (!newRate.rate || !newRate.effectiveDate) return;
    const r = await addRateHistory(emp.id, newRate);
    if (r.ok) { showToast('调薪记录已添加'); setShowRateForm(false); setNewRate({ rate: '', effectiveDate: '', notes: '' }); router.refresh(); }
  });

  const handleMarkInactive = () => {
    if (!confirm(`确认将 ${emp.name} 标记为离职？`)) return;
    startTransition(async () => {
      const today = new Date().toISOString().slice(0, 10);
      await markInactive(emp.id, today);
      showToast('已标记离职');
      router.push('/employees');
    });
  };

  const addAlias = () => {
    const next = aliasInput.trim().replace(/\s+/g, ' ');
    if (!next) return;
    if (next.length > 30) {
      showToast('花名太长');
      return;
    }
    if (aliasDrafts.includes(next)) {
      setAliasInput('');
      return;
    }
    setAliasDrafts(list => [...list, next]);
    setAliasInput('');
  };

  const handleSaveAliases = () => startTransition(async () => {
    const r = await updateEmployeeAliases(emp.id, aliasDrafts);
    if (r.ok) {
      setAliasDrafts(r.aliases);
      setAliasEditing(false);
      showToast('花名已保存');
      router.refresh();
    } else {
      showToast('保存失败');
    }
  });

  const cancelAliasEdit = () => {
    setAliasDrafts(aliases);
    setAliasInput('');
    setAliasEditing(false);
  };

  const field = (label: string, val: string, key: keyof typeof form, type = 'text') => (
    <div>
      <label className="block text-[12px] text-gray-400 mb-1">{label}</label>
      {editing ? (
        <input type={type} value={val}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#3370FF]/40"
        />
      ) : (
        <div className="text-[14px] text-gray-800 py-1">{val || '—'}</div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F0F4FA]">
      <div className="mx-auto max-w-2xl md:px-6 md:py-5">
        {/* Header */}
        <div className="bg-white shadow-sm px-4 pt-4 pb-3 flex items-center justify-between md:rounded-2xl">
          <button onClick={() => router.back()} className="p-1 text-gray-400">
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-[16px] font-semibold text-[#1A3A8F]">{emp.name}</h1>
          <button
            onClick={() => editing ? handleSave() : setEditing(true)}
            disabled={isPending}
            className="text-[14px] font-medium text-[#3370FF]"
          >
            {editing ? (isPending ? '保存中…' : '保存') : '编辑'}
          </button>
        </div>

      <div className="px-3 pt-3 space-y-3 md:px-0">
        {/* Basic info card */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <div className="text-[13px] font-medium text-gray-500 mb-1">基本信息</div>
          {field('姓名', form.name, 'name')}
          <div>
            <label className="block text-[12px] text-gray-400 mb-1">性别</label>
            {editing ? (
              <div className="seg-ctrl">
                {[{v:'female',l:'女'},{v:'male',l:'男'}].map(({v,l}) => (
                  <button key={v} className={form.gender===v?'active':''} onClick={() => setForm(f=>({...f,gender:v}))}>{l}</button>
                ))}
              </div>
            ) : <div className="text-[14px] text-gray-800 py-1">{form.gender==='female'?'女':'男'}</div>}
          </div>
          {field('电话', form.phone, 'phone', 'tel')}
          <div>
            <label className="block text-[12px] text-gray-400 mb-1">身份证</label>
            {editing ? (
              <input value={form.idCard} onChange={e => setForm(f=>({...f,idCard:e.target.value}))}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[14px] font-identifier focus:outline-none focus:ring-2 focus:ring-[#3370FF]/40" />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-identifier text-gray-800">
                  {form.idCard ? (showId ? form.idCard : maskIdCard(form.idCard)) : '—'}
                </span>
                {form.idCard && (
                  <button onClick={() => setShowId(!showId)} className="text-gray-400">
                    {showId ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                )}
              </div>
            )}
          </div>
          {field('岗位', form.positionName, 'positionName')}
          {field('入职日期', form.hireDate, 'hireDate', 'date')}
          {field('离职日期', form.leaveDate, 'leaveDate', 'date')}
          {field('备注', form.notes, 'notes')}
        </div>

        {/* Aliases card */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-gray-500">花名</span>
            {aliasEditing ? (
              <div className="flex items-center gap-3">
                <button onClick={cancelAliasEdit} className="text-[13px] text-gray-400">取消</button>
                <button
                  onClick={handleSaveAliases}
                  disabled={isPending}
                  className="text-[13px] font-medium text-[#3370FF] disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAliasEditing(true)}
                className="text-[13px] font-medium text-[#3370FF]"
              >
                编辑
              </button>
            )}
          </div>

          {aliasEditing ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 min-h-8">
                {aliasDrafts.map(alias => (
                  <span key={alias} className="inline-flex items-center gap-1 rounded-full bg-[#EEF4FF] px-3 py-1.5 text-[13px] text-[#1A3A8F]">
                    {alias}
                    <button
                      onClick={() => setAliasDrafts(list => list.filter(item => item !== alias))}
                      className="text-[#1A3A8F]/50"
                      aria-label={`删除${alias}`}
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
                {aliasDrafts.length === 0 && <span className="text-[13px] text-gray-400 py-1">暂无</span>}
              </div>

              <div className="flex gap-2">
                <input
                  value={aliasInput}
                  onChange={e => setAliasInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addAlias();
                    }
                  }}
                  placeholder="输入花名"
                  className="min-w-0 flex-1 h-10 px-3 rounded-xl border border-gray-200 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#3370FF]/40"
                />
                <button
                  onClick={addAlias}
                  className="h-10 w-10 rounded-xl bg-[#EEF4FF] text-[#3370FF] flex items-center justify-center"
                  aria-label="添加花名"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 min-h-8">
              {aliases.length > 0 ? aliases.map(alias => (
                <span key={alias} className="rounded-full bg-[#EEF4FF] px-3 py-1.5 text-[13px] text-[#1A3A8F]">
                  {alias}
                </span>
              )) : <span className="text-[13px] text-gray-400 py-1">暂无</span>}
            </div>
          )}
        </div>

        {/* Rate history card */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-gray-500">时薪记录</span>
              <button onClick={() => setShowRates(v => !v)} className="text-gray-400">
                {showRates ? <EyeOff size={14}/> : <Eye size={14}/>}
              </button>
            </div>
            <button onClick={() => setShowRateForm(!showRateForm)}
              className="flex items-center gap-1 text-[13px] text-[#3370FF]">
              <TrendingUp size={14}/> 调薪
            </button>
          </div>

          {showRateForm && (
            <div className="bg-[#F0F4FA] rounded-xl p-3 mb-3 space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[11px] text-gray-400">新时薪（元）</label>
                  <input type="number" step="0.5" value={newRate.rate}
                    onChange={e => setNewRate(r=>({...r,rate:e.target.value}))}
                    className="w-full h-9 px-2 rounded-lg border border-gray-200 text-[14px] font-bold text-[#1A3A8F] mt-1" />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] text-gray-400">生效日期</label>
                  <input type="date" value={newRate.effectiveDate}
                    onChange={e => setNewRate(r=>({...r,effectiveDate:e.target.value}))}
                    className="w-full h-9 px-2 rounded-lg border border-gray-200 text-[13px] mt-1" />
                </div>
              </div>
              <input placeholder="备注（可选）" value={newRate.notes}
                onChange={e => setNewRate(r=>({...r,notes:e.target.value}))}
                className="w-full h-9 px-2 rounded-lg border border-gray-200 text-[13px]" />
              <button onClick={handleAddRate} disabled={isPending}
                className="w-full h-9 bg-[#3370FF] text-white text-[13px] font-medium rounded-lg disabled:opacity-60">
                确认调薪
              </button>
            </div>
          )}

          <div className="space-y-2">
            {rateHistory.map((h, i) => (
              <div key={h.id} className="flex items-center justify-between">
                <div>
                  <span className="text-[15px] font-bold text-[#1A3A8F]">
                    {showRates ? h.rate : '***'} 元/时
                  </span>
                  {i === 0 && <span className="ml-2 text-[11px] bg-blue-50 text-[#3370FF] px-2 py-0.5 rounded-full">当前</span>}
                  {h.notes && <div className="text-[11px] text-gray-400">{h.notes}</div>}
                </div>
                <div className="text-[12px] text-gray-400">{h.effectiveDate} 起</div>
              </div>
            ))}
            {rateHistory.length === 0 && <div className="text-[13px] text-gray-400">暂无记录</div>}
          </div>
        </div>

        {/* Danger zone */}
        {emp.status === 'active' && (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <button onClick={handleMarkInactive}
              className="w-full h-11 border border-red-200 text-red-500 text-[14px] font-medium rounded-xl">
              标记离职
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
      </div>
    </div>
  );
}
