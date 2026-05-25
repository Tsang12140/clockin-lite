'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { OvertimeMultipliers } from '@/lib/overtime';
import { saveSalaryRulesAction } from './actions';

type RuleKey = keyof OvertimeMultipliers;

const MULTIPLIER_FIELDS: Array<{ key: RuleKey; title: string; desc: string }> = [
  { key: 'weekday', title: '工作日正常工时', desc: '标准工时以内的工资倍率' },
  { key: 'weekdayOvertime', title: '工作日加班工时', desc: '超过标准工时的部分' },
  { key: 'weekend', title: '休息日上班', desc: '排班休息日的全部工时' },
  { key: 'legalHoliday', title: '法定节假日上班', desc: '内置法定节假日的全部工时' },
];

function fmt(value: number) {
  return value.toFixed(2);
}

export default function OvertimeForm({ initialValues }: { initialValues: OvertimeMultipliers }) {
  const [values, setValues] = useState<Record<RuleKey, string>>({
    standardDailyHours: initialValues.standardDailyHours.toFixed(1),
    weekday: fmt(initialValues.weekday),
    weekdayOvertime: fmt(initialValues.weekdayOvertime),
    weekend: fmt(initialValues.weekend),
    legalHoliday: fmt(initialValues.legalHoliday),
  });
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const example = useMemo(() => {
    const hours = 9.5;
    const rate = 20;
    const standard = Math.max(0, Number.parseFloat(values.standardDailyHours) || 0);
    const normal = Math.min(hours, standard);
    const overtime = Math.max(0, hours - standard);
    const normalWage = normal * rate * (Number.parseFloat(values.weekday) || 0);
    const overtimeWage = overtime * rate * (Number.parseFloat(values.weekdayOvertime) || 0);
    return {
      normal,
      overtime,
      total: normalWage + overtimeWage,
    };
  }, [values]);

  const updateValue = (key: RuleKey, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setMessage('');
  };

  const save = () => {
    setMessage('');
    startTransition(async () => {
      const result = await saveSalaryRulesAction(values);
      if (result.ok) {
        setMessage(result.message);
        router.refresh();
      } else {
        setMessage(result.error);
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="grid gap-2">
          <span className="text-[15px] font-semibold text-gray-800">标准日工时</span>
          <div className="flex items-center gap-2 rounded-2xl bg-[#F8FAFF] px-3 py-3">
            <input
              type="number"
              min="1"
              max="24"
              step="0.5"
              inputMode="decimal"
              value={values.standardDailyHours}
              onChange={event => updateValue('standardDailyHours', event.target.value)}
              className="h-10 w-24 rounded-xl border border-gray-100 bg-white px-3 text-right text-[15px] font-semibold text-[#1A3A8F] outline-none focus:border-[#3370FF]"
            />
            <span className="text-[13px] text-gray-400">小时以内按正常工时计算</span>
          </div>
        </label>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 text-[15px] font-semibold text-gray-800">工资倍率</div>
        <div className="grid gap-2">
          {MULTIPLIER_FIELDS.map(field => (
            <label key={field.key} className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-3 rounded-2xl bg-[#F8FAFF] px-3 py-3">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-gray-700">{field.title}</span>
                <span className="mt-0.5 block truncate text-[12px] text-gray-400">{field.desc}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.1"
                  inputMode="decimal"
                  value={values[field.key]}
                  onChange={event => updateValue(field.key, event.target.value)}
                  className="h-10 w-20 rounded-xl border border-gray-100 bg-white px-2 text-right text-[15px] font-semibold text-[#1A3A8F] outline-none focus:border-[#3370FF]"
                />
                <span className="text-[12px] text-gray-400">倍</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 text-[13px] leading-6 text-gray-500 shadow-sm">
        <div className="font-semibold text-gray-800">示例</div>
        <div className="mt-1">
          工作日记 9.5 小时、时薪 20 元：
          正常 {example.normal.toFixed(1)} 小时，加班 {example.overtime.toFixed(1)} 小时，
          合计 ¥{example.total.toFixed(2)}
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={isPending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#3370FF] text-[15px] font-semibold text-white shadow-sm disabled:opacity-60"
      >
        {isPending && <Loader2 size={16} className="animate-spin" />}
        {isPending ? '保存中...' : '保存薪资规则'}
      </button>

      {message && (
        <div className="rounded-2xl bg-white px-4 py-3 text-center text-[13px] font-medium text-gray-500 shadow-sm">
          {message}
        </div>
      )}
    </div>
  );
}
