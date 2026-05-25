'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completeSetup } from './actions';

type Step = 1 | 2 | 3;

export default function SetupWizard() {
  const [step, setStep] = useState<Step>(1);
  const [factoryShortName, setFactoryShortName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const next1 = () => {
    setError('');
    const trimmed = factoryShortName.trim();
    if (trimmed.length < 1 || trimmed.length > 10) {
      setError('工厂简称需为 1-10 字。');
      return;
    }
    setFactoryShortName(trimmed);
    setStep(2);
  };

  const next2 = () => {
    setError('');
    if (!/^\d{11}$/.test(phone))    { setError('手机号必须是 11 位数字。'); return; }
    if (!/^\d{6}$/.test(password))  { setError('密码必须是 6 位数字。'); return; }
    if (password !== confirmPassword) { setError('两次输入的密码不一致。'); return; }
    setStep(3);
    submit();
  };

  const submit = () => {
    startTransition(async () => {
      try {
        const result = await completeSetup({ factoryShortName, phone, password });
        if (result.ok) {
          router.push('/');
          router.refresh();
        } else {
          setError(result.error);
          setStep(2);
        }
      } catch (e) {
        console.error('setup error', e);
        setError('保存失败：' + String(e));
        setStep(2);
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#F0F4FA] flex flex-col items-center justify-center px-6 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-[22px] font-semibold text-[#1A3A8F]">初始化设置</h1>
          <p className="mt-1 text-[13px] text-gray-400">第一次启动，请完成 3 项基础配置</p>
        </div>

        <StepIndicator step={step} />

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px] text-gray-500">工厂简称</label>
                <input
                  autoFocus
                  value={factoryShortName}
                  onChange={e => setFactoryShortName(e.target.value)}
                  maxLength={10}
                  placeholder="2-4 字最佳"
                  className="h-11 w-full rounded-xl border border-gray-200 px-3 text-[15px] focus:border-[#3370FF] focus:outline-none focus:ring-2 focus:ring-[#3370FF]/40"
                />
                <p className="mt-2 text-[12px] text-gray-400">用于顶部 LOGO 区、页面标题、备份文件名等</p>
              </div>
              {error && <p className="text-[13px] text-red-500">{error}</p>}
              <button
                type="button"
                onClick={next1}
                className="h-12 w-full rounded-xl bg-[#3370FF] text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#245BDB]"
              >
                下一步
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px] text-gray-500">管理员手机号</label>
                <input
                  autoFocus
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{11}"
                  maxLength={11}
                  autoComplete="tel"
                  placeholder="11 位数字"
                  className="h-11 w-full rounded-xl border border-gray-200 px-3 text-[15px] focus:border-[#3370FF] focus:outline-none focus:ring-2 focus:ring-[#3370FF]/40"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] text-gray-500">设置 6 位数字密码</label>
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="new-password"
                  placeholder="••••••"
                  className="h-11 w-full rounded-xl border border-gray-200 px-3 text-[15px] tracking-[0.35em] focus:border-[#3370FF] focus:outline-none focus:ring-2 focus:ring-[#3370FF]/40"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] text-gray-500">确认密码</label>
                <input
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="new-password"
                  placeholder="••••••"
                  className="h-11 w-full rounded-xl border border-gray-200 px-3 text-[15px] tracking-[0.35em] focus:border-[#3370FF] focus:outline-none focus:ring-2 focus:ring-[#3370FF]/40"
                />
              </div>
              {error && <p className="text-[13px] text-red-500">{error}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setError(''); setStep(1); }}
                  className="h-12 flex-1 rounded-xl bg-[#F0F4FA] text-[15px] font-medium text-gray-600"
                >
                  上一步
                </button>
                <button
                  type="button"
                  onClick={next2}
                  className="h-12 flex-[2] rounded-xl bg-[#3370FF] text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#245BDB]"
                >
                  完成设置
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 py-4 text-center">
              <div className="text-[15px] font-medium text-gray-700">
                {isPending ? '正在初始化…' : '初始化完成，进入系统…'}
              </div>
              {error && <p className="text-[13px] text-red-500">{error}</p>}
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-[12px] text-gray-400">
          完成后可以在「设置 → 工厂信息」修改简称
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const labels: Array<{ n: Step; label: string }> = [
    { n: 1, label: '工厂' },
    { n: 2, label: '账号' },
    { n: 3, label: '完成' },
  ];
  return (
    <div className="mb-5 flex items-center justify-center gap-2">
      {labels.map((item, idx) => (
        <span key={item.n} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
              step >= item.n ? 'bg-[#3370FF] text-white' : 'bg-gray-200 text-gray-400'
            }`}
          >
            {item.n}
          </span>
          <span className={`text-[12px] ${step >= item.n ? 'text-[#1A3A8F]' : 'text-gray-400'}`}>
            {item.label}
          </span>
          {idx < labels.length - 1 && <span className="text-gray-300">—</span>}
        </span>
      ))}
    </div>
  );
}
