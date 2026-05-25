'use server';

import { authenticate } from '@/lib/auth';
import { recordAuditLog } from '@/lib/audit';
import { getSession } from '@/lib/session';
import {
  checkLoginRateLimit,
  getServerClientContext,
  recordLoginAttempt,
  pruneOldLoginAttempts,
} from '@/lib/loginRateLimit';
import { getFactoryShortName } from '@/lib/tenant';

type LoginResult =
  | { ok: true }
  | { ok: false; error: 'format' | 'rate-limited' | 'invalid' };

const PHONE_RE = /^\d{11}$/;
const PWD_RE = /^\d{6}$/;

export async function login(formData: FormData): Promise<LoginResult> {
  const username  = String(formData.get('username') ?? '').trim();
  const password  = String(formData.get('password') ?? '').trim();
  const deviceId  = String(formData.get('deviceId') ?? '').trim() || null;
  const browserFp = String(formData.get('browserFingerprint') ?? '').trim() || null;

  if (!PHONE_RE.test(username) || !PWD_RE.test(password)) {
    return { ok: false, error: 'format' };
  }

  const ctx = await getServerClientContext();
  const fingerprintHash = browserFp || ctx.fallbackFingerprint;

  const rl = await checkLoginRateLimit({
    ip: ctx.ip,
    deviceId,
    fingerprintHash,
    attemptType: 'login',
  });
  if (rl.blocked) return { ok: false, error: 'rate-limited' };

  let user;
  try {
    user = await authenticate(username, password);
  } catch (e) {
    console.error('[login] authenticate threw:', e);
    user = null;
  }

  await recordLoginAttempt({
    ip: ctx.ip,
    deviceId,
    fingerprintHash,
    usernameAttempted: username,
    attemptType: 'login',
    success: !!user,
  });

  if (!user) return { ok: false, error: 'invalid' };

  const factoryName = await getFactoryShortName();

  try {
    const session = await getSession();
    session.isLoggedIn = true;
    session.userId     = user.id;
    session.userName   = factoryName;
    session.userPhone  = user.phone;
    session.role       = user.role;
    await session.save();
    await recordAuditLog({
      action: 'login',
      actionLabel: '登录系统',
      pageUrl: '/login',
      user: { userId: user.id, userName: factoryName, userPhone: user.phone },
    });
  } catch (e) {
    console.error('[login] session save threw:', e);
    return { ok: false, error: 'invalid' };
  }

  // Best-effort cleanup of stale rate-limit rows.
  void pruneOldLoginAttempts();

  return { ok: true };
}

export async function logout() {
  const session = await getSession();
  await recordAuditLog({
    action: 'logout',
    actionLabel: '退出登录',
    pageUrl: '/settings',
    user: {
      userId: session.userId,
      userName: session.userName,
      userPhone: session.userPhone,
    },
  });
  await session.destroy();
}
