'use client';

// Persistent device id (UUID) — survives across browser restarts, WiFi/cellular
// switches, and IP changes. Only resets if the user clears localStorage AND cookies.
//
// Browser fingerprint is recomputed each call from UA + screen + timezone + canvas;
// it survives clearing storage but changes when the browser/OS updates.

const STORAGE_KEY = 'clockin_device_id';
const COOKIE_KEY = 'clockin_did';
const COOKIE_DAYS = 365;

export function ensureDeviceId(): string {
  if (typeof window === 'undefined') return '';

  let id = safeRead(STORAGE_KEY);
  const fromCookie = readCookie(COOKIE_KEY);

  if (!id && fromCookie) {
    id = fromCookie;
    safeWrite(STORAGE_KEY, id);
  } else if (!id) {
    id = generateUuid();
    safeWrite(STORAGE_KEY, id);
    writeCookie(COOKIE_KEY, id, COOKIE_DAYS);
  } else if (!fromCookie) {
    writeCookie(COOKIE_KEY, id, COOKIE_DAYS);
  }
  return id;
}

export async function computeBrowserFingerprint(): Promise<string> {
  if (typeof window === 'undefined') return '';
  const parts: string[] = [
    navigator.userAgent,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    navigator.language || '',
    String(navigator.hardwareConcurrency ?? ''),
    String((navigator as { deviceMemory?: number }).deviceMemory ?? ''),
  ];
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 36;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#3370FF';
      ctx.fillRect(0, 0, 120, 36);
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px sans-serif';
      ctx.fillText('clockin-fp-v1', 6, 22);
      parts.push(canvas.toDataURL().slice(-120));
    }
  } catch {
    /* canvas may be blocked — ignore */
  }
  return await sha256Short(parts.join('|'));
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    try { return crypto.randomUUID(); } catch { /* fall through */ }
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function safeRead(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeWrite(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, days: number): void {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

async function sha256Short(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
    } catch {
      /* fall through */
    }
  }
  // Last-resort 32-bit hash; server-side IP still catches abuse if this is degenerate.
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(16, '0');
}
