import { db } from '@/db';
import { sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { createHash } from 'node:crypto';
import { ensureTenantTables } from '@/lib/tenant';
import { isVirtualDbEnabled } from '@/lib/virtualDb';

export const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
export const RATE_LIMIT_MAX_FAILS = 3;

type AttemptType = 'login' | 'developer';

type ClientContext = {
  ip: string | null;
  userAgent: string | null;
  fallbackFingerprint: string;
};

const LOCAL_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

type VirtualAttempt = {
  ip: string | null;
  deviceId: string | null;
  fingerprintHash: string | null;
  usernameAttempted: string;
  attemptType: AttemptType;
  success: boolean;
  attemptedAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __clockinLiteVirtualLoginAttempts: VirtualAttempt[] | undefined;
}

function virtualAttempts(): VirtualAttempt[] {
  globalThis.__clockinLiteVirtualLoginAttempts ??= [];
  return globalThis.__clockinLiteVirtualLoginAttempts;
}

export async function getServerClientContext(): Promise<ClientContext> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  const rawIp = forwarded?.split(',')[0]?.trim()
    || h.get('x-real-ip')
    || h.get('cf-connecting-ip')
    || h.get('x-client-ip')
    || null;
  const ip = rawIp && LOCAL_IPS.has(rawIp) ? '本机' : rawIp;
  const userAgent = h.get('user-agent');
  const acceptLang = h.get('accept-language');
  const fallbackFingerprint = createHash('sha256')
    .update([userAgent, acceptLang].filter(Boolean).join('|'))
    .digest('hex')
    .slice(0, 16);
  return { ip, userAgent, fallbackFingerprint };
}

function isDevBypass(): boolean {
  return process.env.NODE_ENV === 'development';
}

export type LoginRateLimitResult = { blocked: boolean };

export async function checkLoginRateLimit(args: {
  ip: string | null;
  deviceId: string | null;
  fingerprintHash: string | null;
  attemptType: AttemptType;
}): Promise<LoginRateLimitResult> {
  if (isDevBypass()) return { blocked: false };
  if (isVirtualDbEnabled()) {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    const recent = virtualAttempts().filter(item => (
      item.attemptType === args.attemptType
      && item.success === false
      && item.attemptedAt > cutoff
    ));
    const checks = [
      ['ip', args.ip],
      ['deviceId', args.deviceId],
      ['fingerprintHash', args.fingerprintHash],
    ] as const;
    for (const [key, value] of checks) {
      if (!value) continue;
      const count = recent.filter(item => item[key] === value).length;
      if (count >= RATE_LIMIT_MAX_FAILS) return { blocked: true };
    }
    return { blocked: false };
  }
  await ensureTenantTables();
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

  // Helper to run a count query keyed on a single column.
  const countByColumn = async (column: 'ip_address' | 'device_id' | 'fingerprint_hash', value: string) => {
    let result;
    if (column === 'ip_address') {
      result = await db.execute(sql`
        SELECT COUNT(*)::int AS c
        FROM clockin.login_attempts
        WHERE attempt_type = ${args.attemptType}
          AND success = false
          AND attempted_at > ${cutoff}
          AND ip_address = ${value}
      `);
    } else if (column === 'device_id') {
      result = await db.execute(sql`
        SELECT COUNT(*)::int AS c
        FROM clockin.login_attempts
        WHERE attempt_type = ${args.attemptType}
          AND success = false
          AND attempted_at > ${cutoff}
          AND device_id = ${value}
      `);
    } else {
      result = await db.execute(sql`
        SELECT COUNT(*)::int AS c
        FROM clockin.login_attempts
        WHERE attempt_type = ${args.attemptType}
          AND success = false
          AND attempted_at > ${cutoff}
          AND fingerprint_hash = ${value}
      `);
    }
    const rows = (result as unknown as { rows?: Array<{ c: number | string }> }).rows;
    return Number(rows?.[0]?.c ?? 0);
  };

  const checks: Array<['ip_address' | 'device_id' | 'fingerprint_hash', string]> = [];
  if (args.ip)              checks.push(['ip_address',       args.ip]);
  if (args.deviceId)        checks.push(['device_id',        args.deviceId]);
  if (args.fingerprintHash) checks.push(['fingerprint_hash', args.fingerprintHash]);

  if (checks.length === 0) return { blocked: false };

  for (const [column, value] of checks) {
    const count = await countByColumn(column, value);
    if (count >= RATE_LIMIT_MAX_FAILS) return { blocked: true };
  }
  return { blocked: false };
}

export async function recordLoginAttempt(args: {
  ip: string | null;
  deviceId: string | null;
  fingerprintHash: string | null;
  usernameAttempted: string;
  attemptType: AttemptType;
  success: boolean;
}): Promise<void> {
  if (isVirtualDbEnabled()) {
    virtualAttempts().push({ ...args, usernameAttempted: args.usernameAttempted.slice(0, 80), attemptedAt: Date.now() });
    await pruneOldLoginAttempts();
    return;
  }
  try {
    await ensureTenantTables();
    await db.execute(sql`
      INSERT INTO clockin.login_attempts (
        ip_address, device_id, fingerprint_hash, username_attempted, attempt_type, success
      )
      VALUES (
        ${args.ip},
        ${args.deviceId},
        ${args.fingerprintHash},
        ${args.usernameAttempted.slice(0, 80)},
        ${args.attemptType},
        ${args.success}
      )
    `);
  } catch (error) {
    console.warn('[login-rate-limit] failed to record attempt', error);
  }
}

// Cheap cleanup — call lazily from successful logins. Keeps the table small.
export async function pruneOldLoginAttempts(): Promise<void> {
  if (isVirtualDbEnabled()) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    globalThis.__clockinLiteVirtualLoginAttempts = virtualAttempts().filter(item => item.attemptedAt >= cutoff);
    return;
  }
  try {
    await db.execute(sql`
      DELETE FROM clockin.login_attempts
      WHERE attempted_at < NOW() - INTERVAL '1 day'
    `);
  } catch {
    /* ignore */
  }
}
