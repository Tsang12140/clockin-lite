import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
import BottomNav from '@/components/BottomNav';
import AIAssistant from '@/components/AIAssistant';
import ActivityLogger from '@/components/ActivityLogger';
import { getSession } from '@/lib/session';
import { isSetupCompleted, getFactoryShortName } from '@/lib/tenant';
import { getAIAvailability } from '@/lib/ai/config';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const noAuth = process.env.NO_AUTH === 'true';

  if (!noAuth && !(await isSetupCompleted())) redirect('/setup');

  const session = await getSession();
  if (!session.isLoggedIn) {
    if (noAuth) {
      const name = await getFactoryShortName();
      session.isLoggedIn = true;
      session.userId    = '1';
      session.role      = 'admin';
      session.userName  = name || '工厂考勤';
      await session.save();
    } else {
      redirect('/login');
    }
  }

  const [factoryShortName, aiAvailability] = await Promise.all([
    getFactoryShortName(),
    getAIAvailability(session),
  ]);
  const aiUserKey = session.userId || session.userPhone || 'anonymous';
  const aiConfigured = aiAvailability.hasApiKey && Boolean(aiAvailability.baseUrl && aiAvailability.model);
  const aiEnabled = aiAvailability.enabled && aiConfigured;
  const aiManuallyDisabled = aiConfigured && !aiAvailability.enabled;

  return (
    <div className="min-h-full bg-[#F0F4FA]">
      <BottomNav factoryShortName={factoryShortName} />
      <main className="pb-20 lg:pb-0 lg:pt-[72px]">{children}</main>
      <AIAssistant
        userKey={aiUserKey}
        aiEnabled={aiEnabled}
        aiConfigured={aiConfigured}
        aiManuallyDisabled={aiManuallyDisabled}
      />
      <ActivityLogger />
    </div>
  );
}
