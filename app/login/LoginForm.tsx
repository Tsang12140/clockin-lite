'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { login } from './actions';
import { ensureDeviceId, computeBrowserFingerprint } from '@/lib/deviceFingerprint';

export default function LoginForm() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!/^\d{11}$/.test(phone))   { setError('手机号必须是 11 位数字'); return; }
    if (!/^\d{6}$/.test(password)) { setError('密码必须是 6 位数字'); return; }

    startTransition(async () => {
      try {
        const deviceId = ensureDeviceId();
        const browserFingerprint = await computeBrowserFingerprint();
        const fd = new FormData();
        fd.set('username', phone);
        fd.set('password', password);
        fd.set('deviceId', deviceId);
        fd.set('browserFingerprint', browserFingerprint);

        const result = await login(fd);
        if (result.ok) {
          router.push('/');
          router.refresh();
        } else if (result.error === 'rate-limited') {
          setError('尝试次数过多，请 5 分钟后重试');
        } else if (result.error === 'format') {
          setError('手机号或密码格式不正确');
        } else {
          setError('手机号或密码不正确');
        }
      } catch (err) {
        console.error('login error', err);
        setError('登录失败：' + String(err));
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
      <div>
        <label className="block text-[13px] text-gray-500 mb-1.5">手机号</label>
        <input
          name="username"
          type="tel"
          inputMode="numeric"
          pattern="[0-9]{11}"
          maxLength={11}
          autoComplete="tel"
          required
          value={phone}
          onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
          className="w-full h-11 px-3 rounded-xl border border-gray-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#3370FF]/40 focus:border-[#3370FF]"
        />
      </div>
      <div>
        <label className="block text-[13px] text-gray-500 mb-1.5">密码</label>
        <input
          name="password"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          autoComplete="current-password"
          required
          value={password}
          onChange={e => setPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="w-full h-11 px-3 rounded-xl border border-gray-200 text-[15px] tracking-[0.35em] focus:outline-none focus:ring-2 focus:ring-[#3370FF]/40 focus:border-[#3370FF]"
        />
      </div>
      {error && <p className="text-[13px] text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-full h-12 bg-[#3370FF] hover:bg-[#245BDB] text-white font-semibold rounded-xl transition-colors disabled:opacity-60"
      >
        {isPending ? '登录中…' : '登录'}
      </button>
    </form>
  );
}
