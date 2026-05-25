import { db } from '@/db';
import { getSession } from '@/lib/session';
import { sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { createHash } from 'node:crypto';
import { isVirtualDbEnabled } from '@/lib/virtualDb';

export type AuditLogItem = {
  id: number;
  fingerprintId: string;
  emoji: string;
  note: string | null;
  action: string;
  actionLabel: string;
  pageUrl: string | null;
  userId: string | null;
  userName: string | null;
  userPhone: string | null;
  ip: string | null;
  city: string | null;
  device: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditFingerprintItem = {
  id: string;
  emoji: string;
  note: string | null;
  userName: string | null;
  userPhone: string | null;
  ip: string | null;
  city: string | null;
  device: string | null;
  lastSeenAt: string;
};

type UserOverride = {
  userId?: string | null;
  userName?: string | null;
  userPhone?: string | null;
};

const EMOJIS = ['🐶', '🐱', '🐼', '🦊', '🐻', '🐨', '🐯', '🦁', '🐮', '🐷', '🐵', '🐸', '🐰', '🐹', '🐢', '🐬', '🦉', '🐳', '🐴', '🐺'];
const EMOJI_SET = new Set(EMOJIS);
const UNKNOWN_CITY = '未知';
const LOCAL_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const RETENTION_DAYS = 180;

let tableReady: Promise<void> | null = null;

function text(value: unknown, max = 500) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function decodeHeader(value: string | null) {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function pickHeader(h: Headers, keys: string[]) {
  for (const key of keys) {
    const value = text(h.get(key));
    if (value) return value;
  }
  return null;
}

function getClientIp(h: Headers) {
  const forwarded = h.get('x-forwarded-for');
  const firstForwarded = forwarded?.split(',')[0]?.trim();
  const ip = firstForwarded
    || h.get('x-real-ip')
    || h.get('cf-connecting-ip')
    || h.get('x-client-ip')
    || null;
  const normalized = text(ip, 80);
  return normalized && LOCAL_IPS.has(normalized) ? '本机' : normalized;
}

function getCity(h: Headers) {
  const city = pickHeader(h, [
    'x-vercel-ip-city',
    'cf-ipcity',
    'x-appengine-city',
    'x-forwarded-city',
    'x-city',
  ]);
  return decodeHeader(city) || UNKNOWN_CITY;
}

function parseDevice(userAgent: string | null) {
  if (!userAgent) return '未知设备';
  const ua = userAgent.toLowerCase();
  const form = /ipad|tablet/.test(ua)
    ? '平板'
    : /mobile|iphone|android/.test(ua)
      ? '手机'
      : '电脑';
  const os = /windows/.test(ua)
    ? 'Windows'
    : /mac os|macintosh/.test(ua)
      ? 'macOS'
      : /iphone|ipad|ios/.test(ua)
        ? 'iOS'
        : /android/.test(ua)
          ? 'Android'
          : /linux/.test(ua)
            ? 'Linux'
            : '未知系统';
  const browser = /micromessenger/.test(ua)
    ? '微信'
    : /edg\//.test(ua)
      ? 'Edge'
      : /chrome|crios/.test(ua)
        ? 'Chrome'
        : /safari/.test(ua)
          ? 'Safari'
          : /firefox/.test(ua)
            ? 'Firefox'
            : '浏览器';
  return `${form} · ${os} · ${browser}`;
}

function hashFingerprint(parts: Array<string | null | undefined>) {
  return createHash('sha256')
    .update(parts.map(part => part || '').join('|'))
    .digest('hex')
    .slice(0, 16);
}

function emojiFor(id: string) {
  const n = parseInt(id.slice(0, 8), 16);
  return EMOJIS[n % EMOJIS.length];
}

function normalizeEmoji(value: unknown, id: string) {
  const emoji = String(value ?? '');
  return EMOJI_SET.has(emoji) ? emoji : emojiFor(id);
}

function cutoffDate() {
  const date = new Date();
  date.setDate(date.getDate() - RETENTION_DAYS);
  return date.toISOString();
}

function shouldShowDemoAuditData() {
  return process.env.NODE_ENV !== 'production' || isVirtualDbEnabled();
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function demoFingerprints(): AuditFingerprintItem[] {
  return [
    {
      id: 'demo-iphone-chen',
      emoji: '🐶',
      note: '演示：陈阿姨手机',
      userName: '陈阿姨',
      userPhone: '13800000001',
      ip: '113.88.21.16',
      city: '江门市蓬江区',
      device: '手机 · iOS · 微信',
      lastSeenAt: minutesAgo(12),
    },
    {
      id: 'demo-office-pc',
      emoji: '🐱',
      note: '演示：办公室电脑',
      userName: '办公室账号',
      userPhone: '13800000002',
      ip: '183.6.54.88',
      city: '江门市蓬江区',
      device: '电脑 · Windows · Chrome',
      lastSeenAt: minutesAgo(24),
    },
    {
      id: 'demo-boss-android',
      emoji: '🐼',
      note: '演示：老板安卓机',
      userName: '老板',
      userPhone: '13800000003',
      ip: '120.232.18.9',
      city: '佛山市顺德区',
      device: '手机 · Android · Chrome',
      lastSeenAt: minutesAgo(171),
    },
    {
      id: 'demo-ipad-home',
      emoji: '🦊',
      note: '演示：家里平板',
      userName: '家里账号',
      userPhone: '13800000004',
      ip: '14.215.177.39',
      city: '广州市天河区',
      device: '平板 · iOS · Safari',
      lastSeenAt: minutesAgo(64),
    },
  ];
}

function demoLogs(): AuditLogItem[] {
  const fingerprints = demoFingerprints();
  const fp = (id: string) => fingerprints.find(item => item.id === id) ?? fingerprints[0];
  const rows: Array<[string, string, string, string, number]> = [
    ['demo-office-pc', 'page_view', '访问页面', '/settings/developer/audit', 12],
    ['demo-office-pc', 'ui_click', '点击：设备指纹', '/settings/developer/audit', 11],
    ['demo-iphone-chen', 'page_duration', '停留页面：48 秒', '/', 35],
    ['demo-iphone-chen', 'ai_request', 'AI 提问', '/', 42],
    ['demo-iphone-chen', 'ai_response', 'AI 完成回复', '/', 41],
    ['demo-boss-android', 'client_error', '前端报错', '/salary/5?year=2026&month=5', 58],
    ['demo-ipad-home', 'save_ai_config', '修改 AI 配置', '/settings/developer/ai-config', 64],
    ['demo-ipad-home', 'page_view', '访问页面', '/settings/developer/ai-config', 70],
    ['demo-ipad-home', 'login', '登录系统', '/login', 75],
    ['demo-boss-android', 'unlock_attendance', '修改工时：解锁 2026-05-12', '/', 171],
    ['demo-boss-android', 'page_view', '访问页面', '/salary/5?year=2026&month=5', 178],
    ['demo-boss-android', 'login', '登录系统', '/login', 185],
    ['demo-office-pc', 'update_employee', '修改员工：林一鸣', '/employees/5', 286],
    ['demo-office-pc', 'page_view', '访问页面', '/employees', 292],
    ['demo-office-pc', 'login', '登录系统', '/login', 300],
    ['demo-iphone-chen', 'save_attendance', '登记工时：2026-05-13', '/', 410],
    ['demo-iphone-chen', 'page_view', '访问页面', '/', 416],
    ['demo-iphone-chen', 'login', '登录系统', '/login', 420],
  ];

  return rows.map(([fingerprintId, action, actionLabel, pageUrl, ago], index) => {
    const item = fp(fingerprintId);
    return {
      id: 9000 + index,
      fingerprintId,
      emoji: item.emoji,
      note: item.note,
      action,
      actionLabel,
      pageUrl,
      userId: fingerprintId,
      userName: item.userName,
      userPhone: item.userPhone,
      ip: item.ip,
      city: item.city,
      device: item.device,
      detail: { demo: true, source: 'local-preview' },
      createdAt: minutesAgo(ago),
    };
  });
}

async function ensureAuditTables() {
  if (isVirtualDbEnabled()) return;
  if (!tableReady) {
    tableReady = (async () => {
      try {
        await db.execute(sql`CREATE SCHEMA IF NOT EXISTS clockin`);
      } catch {
        const r = await db.execute(sql`
          SELECT 1 FROM information_schema.schemata WHERE schema_name = 'clockin'
        `) as unknown as { rows?: unknown[] };
        if (!r.rows?.length) throw new Error('clockin schema does not exist and could not be created');
      }
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clockin.audit_fingerprints (
          id TEXT PRIMARY KEY,
          emoji TEXT NOT NULL,
          note TEXT,
          user_id TEXT,
          user_name TEXT,
          user_phone TEXT,
          ip TEXT,
          city TEXT,
          device TEXT,
          user_agent TEXT,
          first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS clockin.audit_logs (
          id SERIAL PRIMARY KEY,
          fingerprint_id TEXT NOT NULL REFERENCES clockin.audit_fingerprints(id),
          action TEXT NOT NULL,
          action_label TEXT NOT NULL,
          page_url TEXT,
          user_id TEXT,
          user_name TEXT,
          user_phone TEXT,
          ip TEXT,
          city TEXT,
          device TEXT,
          user_agent TEXT,
          detail JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
        ON clockin.audit_logs (created_at DESC)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS audit_logs_fingerprint_created_at_idx
        ON clockin.audit_logs (fingerprint_id, created_at DESC)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS audit_fingerprints_last_seen_idx
        ON clockin.audit_fingerprints (last_seen_at DESC)
      `);
    })().catch(err => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

export async function recordAuditLog(input: {
  action: string;
  actionLabel: string;
  pageUrl?: string | null;
  detail?: Record<string, unknown> | null;
  user?: UserOverride;
}) {
  if (isVirtualDbEnabled()) return;
  try {
    await ensureAuditTables();

    const h = await headers();
    const session = await getSession().catch(() => null);
    const userId = text(input.user?.userId ?? session?.userId, 80);
    const userName = text(input.user?.userName ?? session?.userName, 80);
    const userPhone = text(input.user?.userPhone ?? session?.userPhone, 80);
    const ip = getClientIp(h);
    const city = getCity(h);
    const userAgent = text(h.get('user-agent'), 1000);
    const device = parseDevice(userAgent);
    const fingerprintId = hashFingerprint([userId, userPhone, ip, city, userAgent]);
    const emoji = emojiFor(fingerprintId);

    await db.execute(sql`
      INSERT INTO clockin.audit_fingerprints (
        id, emoji, user_id, user_name, user_phone, ip, city, device, user_agent, first_seen_at, last_seen_at
      )
      VALUES (
        ${fingerprintId}, ${emoji}, ${userId}, ${userName}, ${userPhone}, ${ip}, ${city}, ${device}, ${userAgent}, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        user_id = COALESCE(EXCLUDED.user_id, clockin.audit_fingerprints.user_id),
        user_name = COALESCE(EXCLUDED.user_name, clockin.audit_fingerprints.user_name),
        user_phone = COALESCE(EXCLUDED.user_phone, clockin.audit_fingerprints.user_phone),
        ip = COALESCE(EXCLUDED.ip, clockin.audit_fingerprints.ip),
        city = COALESCE(EXCLUDED.city, clockin.audit_fingerprints.city),
        device = COALESCE(EXCLUDED.device, clockin.audit_fingerprints.device),
        user_agent = COALESCE(EXCLUDED.user_agent, clockin.audit_fingerprints.user_agent),
        last_seen_at = NOW()
    `);

    const detailJson = input.detail ? JSON.stringify(input.detail).slice(0, 4000) : null;
    const detailValue = detailJson ? sql`${detailJson}::jsonb` : sql`NULL`;

    await db.execute(sql`
      INSERT INTO clockin.audit_logs (
        fingerprint_id, action, action_label, page_url, user_id, user_name, user_phone, ip, city, device, user_agent, detail
      )
      VALUES (
        ${fingerprintId},
        ${input.action.slice(0, 80)},
        ${input.actionLabel.slice(0, 200)},
        ${input.pageUrl?.slice(0, 500) || null},
        ${userId},
        ${userName},
        ${userPhone},
        ${ip},
        ${city},
        ${device},
        ${userAgent},
        ${detailValue}
      )
    `);

    await db.execute(sql`DELETE FROM clockin.audit_logs WHERE created_at < ${cutoffDate()}`);
  } catch (error) {
    console.warn('[audit] failed to record log', error);
  }
}

export async function listAuditLogs(limit = 200): Promise<AuditLogItem[]> {
  if (isVirtualDbEnabled()) return demoLogs().slice(0, Math.max(1, limit));
  try {
    await ensureAuditTables();
    const safeLimit = Math.min(500, Math.max(50, Math.floor(limit)));
    const result = await db.execute(sql`
      SELECT
        l.id,
        l.fingerprint_id,
        f.emoji,
        f.note,
        l.action,
        l.action_label,
        l.page_url,
        l.user_id,
        l.user_name,
        l.user_phone,
        l.ip,
        l.city,
        l.device,
        l.detail,
        l.created_at
      FROM clockin.audit_logs l
      JOIN clockin.audit_fingerprints f ON f.id = l.fingerprint_id
      ORDER BY l.created_at DESC
      LIMIT ${safeLimit}
    `) as { rows?: Record<string, unknown>[] };
    const items = (result.rows ?? []).map(row => ({
      id: Number(row.id),
      fingerprintId: String(row.fingerprint_id),
      emoji: normalizeEmoji(row.emoji, String(row.fingerprint_id)),
      note: text(row.note, 80),
      action: String(row.action ?? ''),
      actionLabel: String(row.action_label ?? ''),
      pageUrl: text(row.page_url, 500),
      userId: text(row.user_id, 80),
      userName: text(row.user_name, 80),
      userPhone: text(row.user_phone, 80),
      ip: text(row.ip, 80),
      city: text(row.city, 80),
      device: text(row.device, 120),
      detail: row.detail as Record<string, unknown> | null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }));
    return items.length > 0 || !shouldShowDemoAuditData() ? items : demoLogs();
  } catch (error) {
    console.warn('[audit] failed to list logs', error);
    return shouldShowDemoAuditData() ? demoLogs() : [];
  }
}

export async function listAuditFingerprints(limit = 80): Promise<AuditFingerprintItem[]> {
  if (isVirtualDbEnabled()) return demoFingerprints().slice(0, Math.max(1, limit));
  try {
    await ensureAuditTables();
    const safeLimit = Math.min(200, Math.max(20, Math.floor(limit)));
    const result = await db.execute(sql`
      SELECT id, emoji, note, user_name, user_phone, ip, city, device, last_seen_at
      FROM clockin.audit_fingerprints
      ORDER BY last_seen_at DESC
      LIMIT ${safeLimit}
    `) as { rows?: Record<string, unknown>[] };
    const items = (result.rows ?? []).map(row => ({
      id: String(row.id),
      emoji: normalizeEmoji(row.emoji, String(row.id)),
      note: text(row.note, 80),
      userName: text(row.user_name, 80),
      userPhone: text(row.user_phone, 80),
      ip: text(row.ip, 80),
      city: text(row.city, 80),
      device: text(row.device, 120),
      lastSeenAt: row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : String(row.last_seen_at),
    }));
    return items.length > 0 || !shouldShowDemoAuditData() ? items : demoFingerprints();
  } catch (error) {
    console.warn('[audit] failed to list fingerprints', error);
    return shouldShowDemoAuditData() ? demoFingerprints() : [];
  }
}

export async function updateAuditFingerprintNote(id: string, note: string) {
  if (isVirtualDbEnabled()) return;
  await ensureAuditTables();
  await db.execute(sql`
    UPDATE clockin.audit_fingerprints
    SET note = ${note.trim().slice(0, 80) || null}
    WHERE id = ${id}
  `);
}
