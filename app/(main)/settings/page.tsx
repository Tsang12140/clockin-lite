'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BadgeDollarSign,
  Bot,
  Building2,
  CalendarDays,
  ChevronRight,
  Clock3,
  DatabaseBackup,
  FlaskConical,
  KeyRound,
  LogOut,
  Palette,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { logout } from '@/app/login/actions';
import { ensureDeviceId, computeBrowserFingerprint } from '@/lib/deviceFingerprint';
import { getDemoModeStatus, updateDemoMode } from './actions';
import { unlockDeveloperOptions } from './developer/actions';

type SettingsCard = {
  href: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  tone: string;
};

const GROUPS: Array<{ title: string; items: SettingsCard[] }> = [
  {
    title: '基础信息',
    items: [
      { href: '/settings/factory', title: '工厂信息', desc: '简称、Logo', icon: Building2, tone: 'bg-[#EEF6F2] text-[#1B7F4A]' },
      { href: '/settings/display', title: '显示偏好', desc: '考勤卡片字号', icon: Palette, tone: 'bg-[#FFF4E5] text-[#B86400]' },
    ],
  },
  {
    title: '考勤规则',
    items: [
      { href: '/settings/schedule', title: '排班制度', desc: '单休、双休、大小周', icon: CalendarDays, tone: 'bg-[#EEF2FF] text-[#3370FF]' },
      { href: '/settings/schedule-calendar', title: '排班日历', desc: '节假日、厂休日、调休', icon: CalendarDays, tone: 'bg-[#F0FDF4] text-[#16A34A]' },
      { href: '/settings/work-time', title: '工作时间', desc: '上下班、午休', icon: Clock3, tone: 'bg-[#F0F9FF] text-[#0077AA]' },
      { href: '/settings/overtime', title: '薪资规则', desc: '正常、加班、节假日', icon: BadgeDollarSign, tone: 'bg-[#FFF1F0] text-[#D83A31]' },
    ],
  },
  {
    title: '智能与提醒',
    items: [
      { href: '/settings/weather', title: '天气配置', desc: 'QWeather、位置', icon: Sparkles, tone: 'bg-[#F4F0FF] text-[#7C3AED]' },
      { href: '/settings/ai', title: 'AI 助手', desc: '...', icon: Bot, tone: 'bg-[#ECFDF5] text-[#059669]' },
      { href: '/settings/developer/invite', title: '邀请体验', desc: '邀请码登录', icon: KeyRound, tone: 'bg-[#FFF7ED] text-[#EA580C]' },
    ],
  },
  {
    title: '数据维护',
    items: [
      { href: '/settings/backup', title: '备份数据', desc: '下载、S3、历史', icon: DatabaseBackup, tone: 'bg-[#F8FAFF] text-[#1A3A8F]' },
    ],
  },
];

function SettingsLinkCard({ item, descOverride }: { item: SettingsCard; descOverride?: string }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="flex min-h-[108px] flex-col justify-between rounded-2xl bg-white p-4 shadow-sm active:bg-[#F8FAFD]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.tone}`}>
          <Icon size={19} />
        </span>
        <ChevronRight size={17} className="mt-1 shrink-0 text-gray-300" />
      </div>
      <div>
        <div className="text-[15px] font-semibold text-gray-800">{item.title}</div>
        <div className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-gray-400">
          {descOverride ?? item.desc}
        </div>
      </div>
    </Link>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[13px] font-semibold text-gray-500">{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const [account, setAccount] = useState('读取中');
  const [demoMode, setDemoModeState] = useState(false);
  const [demoModeReady, setDemoModeReady] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [showDevModal, setShowDevModal] = useState(false);
  const [devPassword, setDevPassword] = useState('');
  const [devError, setDevError] = useState('');
  const [isPending, startTransition] = useTransition();
  const [isDemoPending, startDemoTransition] = useTransition();
  const [isDevPending, startDevTransition] = useTransition();
  const logoTapRef = useRef({ count: 0, timer: 0 });
  const router = useRouter();

  useEffect(() => {
    let active = true;
    fetch('/api/account')
      .then(response => response.json())
      .then(data => {
        if (active && typeof data.account === 'string') setAccount(data.account);
      })
      .catch(() => {
        if (active) setAccount('未知账号');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/settings/ai-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    })
      .then(r => r.json())
      .then(data => {
        if (!active || !data.ok) return;
        const s = data.status;
        if (s.enabled && s.hasApiKey) {
          const name = s.provider === 'deepseek' ? 'DeepSeek' : s.provider === 'openai' ? 'OpenAI' : s.provider;
          setAiSummary(`${name} · ${s.model}`);
        } else if (s.enabled) {
          setAiSummary('需完成配置');
        } else {
          setAiSummary('未开启');
        }
      })
      .catch(() => { if (active) setAiSummary(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    getDemoModeStatus()
      .then(result => {
        if (!active) return;
        if (result.ok) setDemoModeState(result.enabled);
      })
      .finally(() => {
        if (active) setDemoModeReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLogoTap = () => {
    window.clearTimeout(logoTapRef.current.timer);
    const nextCount = logoTapRef.current.count + 1;
    if (nextCount >= 3) {
      logoTapRef.current.count = 0;
      setShowDevModal(true);
      setDevPassword('');
      setDevError('');
      return;
    }
    logoTapRef.current.count = nextCount;
    logoTapRef.current.timer = window.setTimeout(() => {
      logoTapRef.current.count = 0;
    }, 900);
  };

  const handleDevUnlock = () => {
    if (!/^\d{6}$/.test(devPassword)) {
      setDevError('请输入 6 位登录密码');
      return;
    }
    startDevTransition(async () => {
      try {
        const deviceId = ensureDeviceId();
        const browserFingerprint = await computeBrowserFingerprint();
        const fd = new FormData();
        fd.set('password', devPassword);
        fd.set('deviceId', deviceId);
        fd.set('browserFingerprint', browserFingerprint);
        const result = await unlockDeveloperOptions(fd);
        if (result.ok) {
          setShowDevModal(false);
          router.push('/settings/developer');
        } else if (result.error === 'rate-limited') {
          setDevError('尝试次数过多，请 5 分钟后重试');
        } else {
          setDevError('密码不正确');
        }
      } catch (err) {
        setDevError('解锁失败：' + String(err));
      }
    });
  };

  const handleLogout = () => {
    if (!confirm('确认退出登录？')) return;
    startTransition(async () => {
      await logout();
      router.push('/login');
    });
  };

  const handleDemoModeToggle = () => {
    const next = !demoMode;
    startDemoTransition(async () => {
      const result = await updateDemoMode(next);
      if (result.ok) {
        setDemoModeState(result.enabled);
        router.refresh();
      } else {
        alert(result.error);
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#F0F4FA]">
      <div className="mx-auto max-w-2xl md:px-6 md:py-5">
        <div className="bg-white px-4 pb-4 pt-5 shadow-sm md:rounded-2xl">
          <h1 className="text-[17px] font-semibold text-[#1A3A8F]">设置</h1>
        </div>

        <div className="mt-3 space-y-5 px-3 md:px-0">
          {GROUPS.map(group => (
            <Section key={group.title} title={group.title}>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map(item => (
                  <SettingsLinkCard
                    key={item.href}
                    item={item}
                    descOverride={item.href === '/settings/ai' ? (aiSummary ?? item.desc) : undefined}
                  />
                ))}
                {group.title === '数据维护' && (
                  <button
                    type="button"
                    onClick={handleDemoModeToggle}
                    disabled={!demoModeReady || isDemoPending}
                    className="flex min-h-[108px] flex-col justify-between rounded-2xl bg-white p-4 text-left shadow-sm active:bg-[#F8FAFD] disabled:opacity-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF7ED] text-[#EA580C]">
                        <FlaskConical size={19} />
                      </span>
                      <span className={`relative mt-1 h-6 w-11 rounded-full transition-colors ${demoMode ? 'bg-[#3370FF]' : 'bg-gray-200'}`}>
                        <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${demoMode ? 'translate-x-5' : 'translate-x-0'}`} />
                      </span>
                    </div>
                    <div>
                      <div className="text-[15px] font-semibold text-gray-800">演示数据</div>
                      <div className="mt-0.5 text-[12px] leading-4 text-gray-400">
                        {demoMode ? '仅显示示例数据' : '真实数据保留不动'}
                      </div>
                    </div>
                  </button>
                )}
              </div>
            </Section>
          ))}

          <Section title="账户">
            <div className="grid gap-2">
              <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EBF0FF] text-[#3370FF]">
                  <UserRound size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-normal text-gray-400">当前账号</div>
                  <div className="mt-0.5 truncate text-[15px] font-semibold text-gray-800">{account}</div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                disabled={isPending}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-medium text-red-500 shadow-sm disabled:opacity-60"
              >
                <LogOut size={17} />
                {isPending ? '退出中...' : '退出登录'}
              </button>
            </div>
          </Section>
        </div>

        <div className="mt-6 flex flex-col items-center pb-4">
          <button
            type="button"
            onClick={handleLogoTap}
            aria-label="应用信息"
            className="flex h-10 w-10 items-center justify-center rounded-xl active:bg-white/70"
          >
            <img src="/logo.svg" alt="" className="h-7 w-7 rounded-[8px]" />
          </button>
          <div className="mt-1 text-center text-[11px] text-gray-300">v2.08</div>
        </div>
      </div>

      {showDevModal && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/30"
          onClick={() => setShowDevModal(false)}
        >
          <div
            className="w-full rounded-t-2xl bg-white p-5 pb-10"
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EBF0FF] text-[#3370FF]">
                <ShieldCheck size={20} />
              </span>
              <div>
                <div className="text-[15px] font-semibold text-gray-800">开发者验证</div>
                <div className="mt-0.5 text-[12px] text-gray-400">请输入当前账号的登录密码</div>
              </div>
            </div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={devPassword}
              onChange={event => setDevPassword(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className="h-12 w-full rounded-xl bg-[#F0F4FA] px-4 text-center text-[20px] font-medium tracking-[0.35em] text-[#1A3A8F] outline-none"
              placeholder="••••••"
            />
            {devError && (
              <div className="mt-2 text-center text-[12px] text-red-500">{devError}</div>
            )}
            <button
              type="button"
              disabled={isDevPending}
              onClick={handleDevUnlock}
              className="mt-4 h-12 w-full rounded-xl bg-[#3370FF] text-[15px] font-medium text-white shadow-sm disabled:opacity-60"
            >
              {isDevPending ? '验证中...' : '进入开发人员选项'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
