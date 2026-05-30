import { redirect } from 'next/navigation';
import LoginForm from './LoginForm';
import { isSetupCompleted, getFactoryShortName, getInviteLoginSettings } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (!(await isSetupCompleted())) redirect('/setup');
  const [factoryName, inviteSettings] = await Promise.all([
    getFactoryShortName(),
    getInviteLoginSettings(),
  ]);
  return (
    <div className="min-h-screen bg-[#F0F4FA] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt={factoryName} className="mx-auto mb-3 h-16 w-16 rounded-[18px] shadow-sm" />
          <h1 className="text-[22px] font-semibold text-[#1A3A8F]">{factoryName}</h1>
          <p className="text-[13px] text-gray-400 mt-1">工资管理系统</p>
        </div>
        <LoginForm inviteMode={inviteSettings.enabled} />
      </div>
    </div>
  );
}
