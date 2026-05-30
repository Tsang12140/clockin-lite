'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { inviteLogin, login } from './actions';
import { ensureDeviceId, computeBrowserFingerprint } from '@/lib/deviceFingerprint';

export default function LoginForm({ inviteMode = false }: { inviteMode?: boolean }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!phone.trim())    { setError('请输入账号'); return; }
    if (!password.trim()) { setError('请输入密码'); return; }

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

  const handleInviteSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inviteCode.trim()) { setError('请输入邀请码'); return; }

    startTransition(async () => {
      try {
        const deviceId = ensureDeviceId();
        const browserFingerprint = await computeBrowserFingerprint();
        const fd = new FormData();
        fd.set('inviteCode', inviteCode);
        fd.set('deviceId', deviceId);
        fd.set('browserFingerprint', browserFingerprint);

        const result = await inviteLogin(fd);
        if (result.ok) {
          router.push('/');
          router.refresh();
        } else if (result.error === 'rate-limited') {
          setError('尝试次数过多，请 5 分钟后重试');
        } else {
          setError('邀请码不正确');
        }
      } catch (err) {
        console.error('invite login error', err);
        setError('登录失败：' + String(err));
      }
    });
  };

  if (inviteMode) {
    return (
      <form onSubmit={handleInviteSubmit} className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <div>
          <label className="block text-[13px] text-gray-500 mb-1.5">输入邀请码</label>
          <input
            name="inviteCode"
            type="text"
            autoComplete="off"
            required
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value)}
            className="w-full h-12 px-3 rounded-xl border border-gray-200 text-[16px] font-semibold tracking-wide text-[#1A3A8F] focus:outline-none focus:ring-2 focus:ring-[#3370FF]/40 focus:border-[#3370FF]"
          />
        </div>
        {error && <p className="text-[13px] text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="w-full h-12 bg-[#3370FF] hover:bg-[#245BDB] text-white font-semibold rounded-xl transition-colors disabled:opacity-60"
        >
          {isPending ? '进入中…' : '进入体验'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
      <div>
        <label className="block text-[13px] text-gray-500 mb-1.5">账号</label>
        <input
          name="username"
          type="text"
          autoComplete="username"
          required
          value={phone}
          onChange={e => setPhone(e.target.value)}
          className="w-full h-11 px-3 rounded-xl border border-gray-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#3370FF]/40 focus:border-[#3370FF]"
        />
      </div>
      <div>
        <label className="block text-[13px] text-gray-500 mb-1.5">密码</label>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full h-11 px-3 rounded-xl border border-gray-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#3370FF]/40 focus:border-[#3370FF]"
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
