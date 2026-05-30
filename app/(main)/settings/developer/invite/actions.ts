'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { recordAuditLog } from '@/lib/audit';
import { getSession } from '@/lib/session';
import { upsertTenantConfig } from '@/lib/tenant';

export type InviteSettingsResult =
  | { ok: true }
  | { ok: false; error: string };

async function ensureSettingsAccess() {
  const session = await getSession();
  if (!session.isLoggedIn) redirect('/login');
  return session;
}

export async function saveInviteSettings(formData: FormData): Promise<InviteSettingsResult> {
  const session = await ensureSettingsAccess();
  const enabled = formData.get('enabled') === 'on';
  const code = String(formData.get('code') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();

  if (enabled && code.length < 3) {
    return { ok: false, error: '邀请码至少 3 个字符。' };
  }
  if (phone && !/^[\d+\-\s]{4,30}$/.test(phone)) {
    return { ok: false, error: '登录账号手机号格式不正确。' };
  }

  await upsertTenantConfig({
    inviteLoginEnabled: enabled,
    inviteCode: code || null,
    inviteLoginPhone: phone || null,
  });
  await recordAuditLog({
    action: 'save_invite_login',
    actionLabel: '修改邀请体验',
    pageUrl: '/settings/developer/invite',
    user: session,
    detail: {
      enabled,
      hasCode: Boolean(code),
      targetPhone: phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : 'default',
    },
  });

  revalidatePath('/login');
  revalidatePath('/settings');
  revalidatePath('/settings/developer/invite');
  return { ok: true };
}
