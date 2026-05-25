import { aiChatLogs, db } from '@/db';
import { and, desc, eq, gt, lt, sql } from 'drizzle-orm';

type ChatAction = { type: string; label: string; href: string };

export type AIHistoryItem = {
  id: number;
  userId: string | null;
  userPhone: string | null;
  userMessage: string;
  assistantReply: string;
  mode: string;
  pageUrl: string | null;
  actions: ChatAction[] | null;
  createdAt: string;
};

const RETENTION_DAYS = 180;
const DEFAULT_DAYS = 30;
const DEFAULT_LIMIT = 30;

let tableReady: Promise<void> | null = null;

function cutoffDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function safeLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(50, Math.max(10, Math.floor(parsed)));
}

async function ensureHistoryTable() {
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
        CREATE TABLE IF NOT EXISTS clockin.ai_chat_logs (
          id SERIAL PRIMARY KEY,
          user_id TEXT,
          user_phone TEXT,
          user_message TEXT NOT NULL,
          assistant_reply TEXT NOT NULL,
          mode TEXT NOT NULL,
          page_url TEXT,
          actions JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute(sql`ALTER TABLE clockin.ai_chat_logs ADD COLUMN IF NOT EXISTS user_id TEXT`);
      await db.execute(sql`ALTER TABLE clockin.ai_chat_logs ADD COLUMN IF NOT EXISTS user_phone TEXT`);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS ai_chat_logs_created_at_idx
        ON clockin.ai_chat_logs (created_at DESC)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS ai_chat_logs_user_created_at_idx
        ON clockin.ai_chat_logs (user_id, created_at DESC)
      `);
    })().catch(err => {
      tableReady = null;
      throw err;
    });
  }
  return tableReady;
}

export async function saveAIChatLog(input: {
  userId?: string | null;
  userPhone?: string | null;
  userMessage: string;
  assistantReply: string;
  mode: 'ai' | 'rules';
  pageUrl?: string | null;
  actions?: ChatAction[];
}) {
  try {
    await ensureHistoryTable();
    await db.delete(aiChatLogs).where(lt(aiChatLogs.createdAt, cutoffDate(RETENTION_DAYS)));
    await db.insert(aiChatLogs).values({
      userId: input.userId || null,
      userPhone: input.userPhone || null,
      userMessage: input.userMessage.slice(0, 2000),
      assistantReply: input.assistantReply.slice(0, 4000),
      mode: input.mode,
      pageUrl: input.pageUrl?.slice(0, 500) || null,
      actions: input.actions ?? [],
    });
  } catch (error) {
    console.warn('[ai-history] failed to save chat log', error);
  }
}

export async function getAIChatHistory(params: {
  userId?: string | null;
  before?: string | null;
  limit?: string | null;
}) {
  try {
    await ensureHistoryTable();
    const limit = safeLimit(params.limit ?? null);
    const retentionCutoff = cutoffDate(RETENTION_DAYS);
    const firstPageCutoff = cutoffDate(DEFAULT_DAYS);
    const beforeDate = params.before ? new Date(params.before) : null;
    const lowerBound = beforeDate ? retentionCutoff : firstPageCutoff;

    const userFilter = params.userId
      ? eq(aiChatLogs.userId, params.userId)
      : sql`1 = 0`;
    const where = beforeDate && !Number.isNaN(beforeDate.getTime())
      ? and(userFilter, gt(aiChatLogs.createdAt, lowerBound), lt(aiChatLogs.createdAt, beforeDate))
      : and(userFilter, gt(aiChatLogs.createdAt, lowerBound));

    const rows = await db
      .select()
      .from(aiChatLogs)
      .where(where)
      .orderBy(desc(aiChatLogs.createdAt))
      .limit(limit + 1);

    const pageRows = rows.slice(0, limit);
    let nextCursor = rows.length > limit && pageRows.length > 0
      ? pageRows[pageRows.length - 1].createdAt.toISOString()
      : null;
    if (!nextCursor && !beforeDate) {
      const olderRows = await db
        .select({ id: aiChatLogs.id })
        .from(aiChatLogs)
        .where(and(userFilter, gt(aiChatLogs.createdAt, retentionCutoff), lt(aiChatLogs.createdAt, firstPageCutoff)))
        .limit(1);
      if (olderRows.length > 0) nextCursor = firstPageCutoff.toISOString();
    }

    return {
      ok: true,
      items: pageRows.map(row => ({
        id: row.id,
        userId: row.userId,
        userPhone: row.userPhone,
        userMessage: row.userMessage,
        assistantReply: row.assistantReply,
        mode: row.mode,
        pageUrl: row.pageUrl,
        actions: row.actions ?? [],
        createdAt: row.createdAt.toISOString(),
      } satisfies AIHistoryItem)),
      nextCursor,
    };
  } catch (error) {
    console.warn('[ai-history] failed to read chat logs', error);
    return { ok: false, items: [] as AIHistoryItem[], nextCursor: null };
  }
}
