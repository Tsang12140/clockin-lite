import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getSession } from '@/lib/session';
import { getTenantConfig } from '@/lib/tenant';
import DeveloperUnlockForm from './DeveloperUnlockForm';

type PageProps = {
  searchParams?: Promise<{ error?: string }>;
};

function DeveloperLinks() {
  const items = [
    { href: '/weather-preview', title: '天气效果预览', desc: '晴天、雨天、雷阵雨' },
    { href: '/settings/developer/attendance-preview', title: '考勤卡片预览', desc: '保存完成效果' },
    { href: '/settings/developer/attendance-desktop-preview', title: '考勤卡片预览（桌面端）', desc: '桌面录入表保存效果' },
    { href: '/settings/developer/audit', title: '操作日志', desc: '登录、访问、工时和设备指纹' },
    { href: '/settings/developer/invite', title: '邀请体验', desc: '邀请码登录开关与邀请码' },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-50">
      {items.map(item => (
        <Link
          key={item.href}
          href={item.href}
          className="flex items-center justify-between px-4 py-4"
        >
          <div>
            <div className="text-[15px] font-medium text-gray-800">{item.title}</div>
            <div className="text-[12px] font-normal text-gray-400 mt-0.5">{item.desc}</div>
          </div>
          <ChevronRight size={18} className="text-gray-300" />
        </Link>
      ))}
    </div>
  );
}

export default async function DeveloperSettingsPage({ searchParams }: PageProps) {
  const [session, tenantConfig, params] = await Promise.all([getSession(), getTenantConfig(), searchParams]);
  const unlocked = session.developerUnlocked === true || tenantConfig?.developerMode === true;

  return (
    <div className="min-h-screen bg-[#F0F4FA]">
      <div className="max-w-2xl mx-auto md:px-6 md:py-5">
        <div className="bg-white shadow-sm px-4 pt-5 pb-4 flex items-center md:rounded-2xl">
          <Link href="/settings" className="p-1 mr-3 text-gray-400">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-[17px] font-semibold text-[#1A3A8F]">开发人员选项</h1>
        </div>

        <div className="px-3 mt-3 md:px-0">
          {unlocked ? <DeveloperLinks /> : <DeveloperUnlockForm initialError={params?.error === '1'} />}
        </div>
      </div>
    </div>
  );
}
