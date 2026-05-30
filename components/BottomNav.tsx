'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Users, FileText, Settings } from 'lucide-react';

const tabs = [
  { href: '/',          label: '今日录入', icon: CalendarDays },
  { href: '/salary',    label: '月度工资', icon: FileText    },
  { href: '/employees', label: '员工管理', icon: Users       },
  { href: '/settings',  label: '设置',    icon: Settings    },
];

export default function BottomNav({ factoryShortName }: { factoryShortName: string }) {
  const pathname = usePathname();

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-50 safe-area-bottom lg:hidden">
        <div className="flex h-16">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5"
              >
                <span className={`flex items-center justify-center w-10 h-7 rounded-xl transition-colors ${active ? 'bg-blue-50' : ''}`}>
                  <Icon size={22} className={active ? 'text-[#3370FF]' : 'text-gray-400'} />
                </span>
                <span className={`text-[11px] leading-none ${active ? 'text-[#1A3A8F] font-semibold' : 'text-gray-500 font-medium'}`}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <nav className="fixed inset-x-0 top-0 z-50 hidden border-b border-gray-200/70 bg-white/95 backdrop-blur lg:block">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex select-none items-center gap-2.5">
            <img src="/logo.svg" alt="" className="h-8 w-8 rounded-[9px] shadow-sm" />
            <div>
              <div className="text-[16px] font-bold leading-tight tracking-[-0.01em] text-[#1A3A8F]">{factoryShortName}考勤</div>
              <div className="text-[11px] font-normal leading-tight text-gray-400" style={{ fontWeight: 400 }}>工厂考勤管理系统</div>
            </div>
          </Link>
          <div className="flex items-center gap-1 rounded-2xl bg-[#F0F4FA] p-1">
            {tabs.map(({ href, label, icon: Icon }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex h-10 items-center gap-2 rounded-xl px-4 text-[14px] font-semibold transition-colors
                    ${active ? 'bg-white text-[#3370FF] shadow-sm' : 'text-gray-500 hover:bg-white/70 hover:text-[#1A3A8F]'}`}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
