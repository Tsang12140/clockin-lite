'use server';

import { authenticate, getInviteLoginUser } from '@/lib/auth';
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
  | { ok: false; error: 'format' | 'rate-limited' | 'invalid' | 'disabled' };

function isInviteLoginEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.INVITE_LOGIN_ENABLED ?? '').trim().toLowerCase());
}

function getInviteCode(): string {
  return String(process.env.INVITE_CODE ?? '').trim();
}

async function saveLoginSession(user: { id: string; phone: string; role: string }, action: 'login' | 'invite_login') {
  const factoryName = await getFactoryShortName();
  const session = await getSession();
  session.isLoggedIn = true;
  session.userId     = user.id;
  session.userName   = factoryName;
  session.userPhone  = user.phone;
  session.role       = user.role;
  await session.save();
  await recordAuditLog({
    action,
    actionLabel: action === 'invite_login' ? '邀请码登录' : '登录系统',
    pageUrl: '/login',
    user: { userId: user.id, userName: factoryName, userPhone: user.phone },
  });
}

export async function login(formData: FormData): Promise<LoginResult> {
  const username  = String(formData.get('username') ?? '').trim();
  const password  = String(formData.get('password') ?? '').trim();
  const deviceId  = String(formData.get('deviceId') ?? '').trim() || null;
  const browserFp = String(formData.get('browserFingerprint') ?? '').trim() || null;

  if (!username || !password) {
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

  try {
    await saveLoginSession(user, 'login');
  } catch (e) {
    console.error('[login] session save threw:', e);
    return { ok: false, error: 'invalid' };
  }

  // Best-effort cleanup of stale rate-limit rows.
  void pruneOldLoginAttempts();

  return { ok: true };
}

export async function inviteLogin(formData: FormData): Promise<LoginResult> {
  const inviteCode = String(formData.get('inviteCode') ?? '').trim();
  const deviceId  = String(formData.get('deviceId') ?? '').trim() || null;
  const browserFp = String(formData.get('browserFingerprint') ?? '').trim() || null;

  if (!isInviteLoginEnabled()) return { ok: false, error: 'disabled' };
  if (!inviteCode) return { ok: false, error: 'format' };

  const ctx = await getServerClientContext();
  const fingerprintHash = browserFp || ctx.fallbackFingerprint;
  const rl = await checkLoginRateLimit({
    ip: ctx.ip,
    deviceId,
    fingerprintHash,
    attemptType: 'invite',
  });
  if (rl.blocked) return { ok: false, error: 'rate-limited' };

  const expectedCode = getInviteCode();
  const success = Boolean(expectedCode) && inviteCode.toLowerCase() === expectedCode.toLowerCase();

  await recordLoginAttempt({
    ip: ctx.ip,
    deviceId,
    fingerprintHash,
    usernameAttempted: 'invite',
    attemptType: 'invite',
    success,
  });

  if (!success) return { ok: false, error: 'invalid' };

  const user = await getInviteLoginUser(process.env.INVITE_LOGIN_PHONE);
  if (!user) return { ok: false, error: 'invalid' };

  try {
    await saveLoginSession(user, 'invite_login');
  } catch (e) {
    console.error('[login] invite session save threw:', e);
    return { ok: false, error: 'invalid' };
  }

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
