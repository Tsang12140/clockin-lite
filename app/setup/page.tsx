import { redirect } from 'next/navigation';
import { isSetupCompleted } from '@/lib/tenant';
import SetupWizard from './SetupWizard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '初始化设置',
};

export default async function SetupPage() {
  if (await isSetupCompleted()) redirect('/');
  return <SetupWizard />;
}
