'use server';

import { verifyPassword } from '@/lib/password';
import { recordAuditLog } from '@/lib/audit';
import { getSession } from '@/lib/session';
import { db, adminUsers } from '@/db';
import { eq } from 'drizzle-orm';
import { upsertTenantConfig } from '@/lib/tenant';
import {
  checkLoginRateLimit,
  getServerClientContext,
  recordLoginAttempt,
} from '@/lib/loginRateLimit';

type UnlockResult =
  | { ok: true }
  | { ok: false; error: 'rate-limited' | 'invalid' | 'format' };

export async function unlockDeveloperOptions(formData: FormData): Promise<UnlockResult> {
  const password  = String(formData.get('password')  ?? '').trim();
  const deviceId  = String(formData.get('deviceId')  ?? '').trim() || null;
  const browserFp = String(formData.get('browserFingerprint') ?? '').trim() || null;

  if (!/^\d{6}$/.test(password)) return { ok: false, error: 'format' };

  const ctx = await getServerClientContext();
  const fingerprintHash = browserFp || ctx.fallbackFingerprint;

  const rl = await checkLoginRateLimit({
    ip: ctx.ip,
    deviceId,
    fingerprintHash,
    attemptType: 'developer',
  });
  if (rl.blocked) return { ok: false, error: 'rate-limited' };

  const session = await getSession();
  const [admin] = await db
    .select({ passwordHash: adminUsers.passwordHash })
    .from(adminUsers)
    .where(eq(adminUsers.phone, session.userPhone ?? ''))
    .limit(1);

  const ok = admin ? await verifyPassword(password, admin.passwordHash) : false;

  await recordLoginAttempt({
    ip: ctx.ip,
    deviceId,
    fingerprintHash,
    usernameAttempted: 'developer',
    attemptType: 'developer',
    success: ok,
  });

  if (!ok) return { ok: false, error: 'invalid' };

  session.developerUnlocked = true;
  await session.save();
  await upsertTenantConfig({ developerMode: true });

  await recordAuditLog({
    action: 'developer_unlock',
    actionLabel: '进入开发人员选项',
    pageUrl: '/settings/developer',
  });
  return { ok: true };
}
