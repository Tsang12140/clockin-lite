import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const HASH_LENGTH = 64;

// Format: scrypt:{saltHex}:{hashHex}
// salt is passed to scrypt as a raw hex string (NOT decoded to Buffer) — keeps
// compatibility with existing scrypt:saltHex:hashHex records.
export async function hashPassword(plain: string): Promise<string> {
  const saltHex = randomBytes(16).toString('hex');
  const hash = (await scryptAsync(plain, saltHex, HASH_LENGTH)) as Buffer;
  return `scrypt:${saltHex}:${hash.toString('hex')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltHex, hashHex] = parts;
  try {
    const storedBuf = Buffer.from(hashHex, 'hex');
    const derived = (await scryptAsync(plain, saltHex, storedBuf.length)) as Buffer;
    return storedBuf.length === derived.length && timingSafeEqual(storedBuf, derived);
  } catch {
    return false;
  }
}
