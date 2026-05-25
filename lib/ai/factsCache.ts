import { mkdir, readFile, writeFile, unlink, readdir } from 'fs/promises';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.runtime', 'facts-cache');

function rangeKey(startDate: string, endDate: string): string {
  return `range_${startDate}_${endDate}.json`;
}

export async function getFactsCache<T>(startDate: string, endDate: string): Promise<T | null> {
  try {
    const raw = await readFile(path.join(CACHE_DIR, rangeKey(startDate, endDate)), 'utf-8');
    const data = JSON.parse(raw) as { facts: T };
    return data.facts ?? null;
  } catch {
    return null;
  }
}

export async function setFactsCache<T>(startDate: string, endDate: string, facts: T): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(
      path.join(CACHE_DIR, rangeKey(startDate, endDate)),
      JSON.stringify({ createdAt: new Date().toISOString(), facts }),
      'utf-8',
    );
  } catch {
    // ignore write errors — cache miss is acceptable
  }
}

export async function invalidateCacheForDate(date: string): Promise<void> {
  try {
    const files = await readdir(CACHE_DIR);
    await Promise.all(
      files
        .filter(f => f.startsWith('range_') && f.endsWith('.json'))
        .filter(f => {
          // filename: range_YYYY-MM-DD_YYYY-MM-DD.json
          const inner = f.slice('range_'.length, -'.json'.length);
          const sep = inner.indexOf('_', 11); // skip past first date
          if (sep < 0) return false;
          const start = inner.slice(0, sep);
          const end = inner.slice(sep + 1);
          return date >= start && date <= end;
        })
        .map(f => unlink(path.join(CACHE_DIR, f)).catch(() => {})),
    );
  } catch {
    // directory may not exist yet — fine
  }
}
