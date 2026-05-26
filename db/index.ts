import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

function numberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: numberEnv('PG_CONNECTION_TIMEOUT_MS', 5000),
  idleTimeoutMillis: numberEnv('PG_IDLE_TIMEOUT_MS', 30000),
  query_timeout: numberEnv('PG_QUERY_TIMEOUT_MS', 15000),
  statement_timeout: numberEnv('PG_STATEMENT_TIMEOUT_MS', 15000),
  max: numberEnv('PG_POOL_MAX', 5),
});

export const db = drizzle(pool, { schema });
export * from './schema';
