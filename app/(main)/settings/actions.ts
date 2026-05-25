'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/requireAuth';
import { isDemoModeEnabled, setDemoMode } from '@/lib/demoMode';
import { recordAuditLog } from '@/lib/audit';

type DemoModeResult =
  | { ok: true; enabled: boolean }
  | { ok: false; error: string };

export async function getDemoModeStatus(): Promise<DemoModeResult> {
  try {
    await requireAuth();
    return { ok: true, enabled: await isDemoModeEnabled() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '读取失败' };
  }
}

export async function updateDemoMode(enabled: boolean): Promise<DemoModeResult> {
  const session = await requireAuth();
  try {
    await setDemoMode(enabled);
    await recordAuditLog({
      action: enabled ? 'enable_demo_mode' : 'disable_demo_mode',
      actionLabel: enabled ? '开启演示数据' : '关闭演示数据',
      pageUrl: '/settings',
      user: session,
      detail: { enabled },
    });
    revalidatePath('/');
    revalidatePath('/employees');
    revalidatePath('/salary');
    revalidatePath('/settings');
    return { ok: true, enabled };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '保存失败' };
  }
}
