import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getWeatherConfigStatus } from '@/lib/weatherServer';
import WeatherForm from './WeatherForm';

export const dynamic = 'force-dynamic';

export default async function WeatherSettingsPage() {
  const status = await getWeatherConfigStatus();

  return (
    <div className="min-h-screen bg-[#F0F4FA]">
      <div className="mx-auto max-w-2xl md:px-6 md:py-5">
        <div className="flex items-center bg-white px-4 pb-4 pt-5 shadow-sm md:rounded-2xl">
          <Link href="/settings" className="mr-3 p-1 text-gray-400">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-[17px] font-semibold text-[#1A3A8F]">天气配置</h1>
        </div>

        <div className="space-y-3 px-3 py-3 md:px-0">
          <WeatherForm status={status} />
        </div>
      </div>
    </div>
  );
}
