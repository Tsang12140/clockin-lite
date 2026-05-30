'use client';

import { useState, useTransition } from 'react';
import { Save } from 'lucide-react';
import { saveInviteSettings } from './actions';

export default function InviteSettingsForm({
  initialEnabled,
  initialCode,
  initialPhone,
  fallbackPhone,
}: {
  initialEnabled: boolean;
  initialCode: string;
  initialPhone: string;
  fallbackPhone: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [code, setCode] = useState(initialCode || 'merging');
  const [phone, setPhone] = useState(initialPhone || fallbackPhone);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    const formData = new FormData(event.currentTarget);
    if (enabled) formData.set('enabled', 'on');
    startTransition(async () => {
      const result = await saveInviteSettings(formData);
      if (result.ok) {
        setMessage('已保存。下次打开登录页会按这个设置显示。');
      } else {
        setMessage(result.error);
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[15px] font-semibold text-gray-800">邀请码登录</div>
            <div className="mt-1 text-[12px] leading-5 text-gray-400">
              开启后，登录页只显示邀请码输入；输对后直接进入指定账号。
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(v => !v)}
            className={`relative h-7 w-[52px] shrink-0 rounded-full transition-colors ${enabled ? 'bg-[#3370FF]' : 'bg-gray-200'}`}
            aria-label={enabled ? '关闭邀请码登录' : '开启邀请码登录'}
          >
            <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium text-gray-600">邀请码</span>
            <input
              name="code"
              value={code}
              onChange={event => setCode(event.target.value)}
              className="h-11 rounded-xl bg-[#F0F4FA] px-3 text-[15px] font-semibold tracking-wide text-[#1A3A8F] outline-none focus:ring-2 focus:ring-[#3370FF]/20"
              placeholder="merging"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[13px] font-medium text-gray-600">进入账号手机号</span>
            <input
              name="phone"
              value={phone}
              onChange={event => setPhone(event.target.value)}
              className="h-11 rounded-xl bg-[#F0F4FA] px-3 text-[14px] text-gray-800 outline-none focus:ring-2 focus:ring-[#3370FF]/20"
              placeholder={fallbackPhone || '留空则使用第一个管理员账号'}
            />
            <span className="text-[11px] leading-5 text-gray-400">
              建议填已配置好 AI 的管理员手机号；留空则使用第一个管理员账号。
            </span>
          </label>

          {message && (
            <div className={`rounded-xl px-3 py-2.5 text-[12px] leading-5 ${message.startsWith('已保存') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {message}
            </div>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#3370FF] text-[14px] font-semibold text-white shadow-sm disabled:opacity-60"
      >
        <Save size={16} />
        {isPending ? '保存中…' : '保存邀请设置'}
      </button>
    </form>
  );
}
