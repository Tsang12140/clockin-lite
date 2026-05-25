import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import DisplayPreferences from './DisplayPreferences';

export default function DisplaySettingsPage() {
  return (
    <div className="min-h-screen bg-[#F0F4FA]">
      <div className="mx-auto max-w-2xl md:px-6 md:py-5">
        <div className="flex items-center gap-3 bg-white px-4 pb-4 pt-5 shadow-sm md:rounded-2xl">
          <Link
            href="/settings"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F0F4FA] text-gray-500"
            aria-label="返回设置"
          >
            <ChevronLeft size={18} />
          </Link>
          <div>
            <h1 className="text-[17px] font-semibold text-[#1A3A8F]">显示偏好</h1>
            <div className="mt-0.5 text-[12px] text-gray-400">考勤卡片字号</div>
          </div>
        </div>

        <div className="mt-3 px-3 pb-6 md:px-0">
          <DisplayPreferences />
        </div>
      </div>
    </div>
  );
}
