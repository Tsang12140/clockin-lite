import { redirect } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import AIAssistant from '@/components/AIAssistant';
import ActivityLogger from '@/components/ActivityLogger';
import { getSession } from '@/lib/session';
import { isSetupCompleted, getFactoryShortName } from '@/lib/tenant';
import { getAIAvailability } from '@/lib/ai/config';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSetupCompleted())) redirect('/setup');
  const [session, factoryShortName, aiAvailability] = await Promise.all([
    getSession(),
    getFactoryShortName(),
    getAIAvailability(),
  ]);
  if (!session.isLoggedIn) redirect('/login');
  const aiUserKey = session.userId || session.userPhone || 'anonymous';
  const aiConfigured = aiAvailability.hasApiKey && Boolean(aiAvailability.baseUrl && aiAvailability.model);
  const aiEnabled = aiAvailability.enabled && aiConfigured;
  const aiManuallyDisabled = aiConfigured && !aiAvailability.enabled;

  return (
    <div className="min-h-full bg-[#F0F4FA]">
      <BottomNav factoryShortName={factoryShortName} />
      <main className="pb-20 md:pb-0 md:pt-[72px]">{children}</main>
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
