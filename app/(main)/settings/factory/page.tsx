import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getTenantConfig } from '@/lib/tenant';
import FactoryForm from './FactoryForm';

export default async function FactorySettingsPage() {
  const config = await getTenantConfig();
  return (
    <div className="min-h-screen bg-[#F0F4FA]">
      <div className="mx-auto max-w-2xl md:px-6 md:py-5">
        <div className="bg-white shadow-sm px-4 pt-5 pb-4 flex items-center md:rounded-2xl">
          <Link href="/settings" className="p-1 mr-3 text-gray-400">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-[17px] font-semibold text-[#1A3A8F]">工厂信息</h1>
        </div>

        <div className="px-3 mt-3 md:px-0">
          <FactoryForm
            initialFactoryShortName={config?.factoryShortName ?? ''}
            initialLogoBase64={config?.logoBase64 ?? ''}
          />
        </div>
      </div>
    </div>
  );
}
