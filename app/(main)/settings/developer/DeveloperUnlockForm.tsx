'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { ensureDeviceId, computeBrowserFingerprint } from '@/lib/deviceFingerprint';
import { unlockDeveloperOptions } from './actions';

export default function DeveloperUnlockForm({ initialError }: { initialError: boolean }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError ? '密码不正确' : '');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(password)) { setError('请输入 6 位数字'); return; }

    startTransition(async () => {
      try {
        const deviceId = ensureDeviceId();
        const browserFingerprint = await computeBrowserFingerprint();
        const fd = new FormData();
        fd.set('password', password);
        fd.set('deviceId', deviceId);
        fd.set('browserFingerprint', browserFingerprint);

        const result = await unlockDeveloperOptions(fd);
        if (result.ok) {
          router.push('/settings/developer');
          router.refresh();
        } else if (result.error === 'rate-limited') {
          setError('尝试次数过多，请 5 分钟后重试');
        } else {
          setError('密码不正确');
        }
      } catch (err) {
        console.error('developer unlock error', err);
        setError('解锁失败：' + String(err));
      }
    });
  };

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EBF0FF] text-[#3370FF]">
          <ShieldCheck size={20} />
        </span>
        <div>
          <div className="text-[15px] font-medium text-gray-800">开发者验证</div>
          <div className="mt-0.5 text-[12px] font-normal text-gray-400">进入后可查看日志、预览和 AI 配置</div>
        </div>
      </div>
      <form onSubmit={handleSubmit}>
        <input
          name="password"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          autoComplete="off"
          value={password}
          onChange={e => setPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="h-12 w-full rounded-xl bg-[#F0F4FA] px-4 text-center text-[20px] font-medium tracking-[0.35em] text-[#1A3A8F] outline-none"
          placeholder="••••••"
        />
        {error && (
          <div className="mt-2 text-center text-[12px] font-normal text-red-500">{error}</div>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="mt-4 h-12 w-full rounded-xl bg-[#3370FF] text-[15px] font-medium text-white shadow-sm disabled:opacity-60"
        >
          {isPending ? '验证中…' : '进入开发人员选项'}
        </button>
      </form>
    </div>
  );
}
