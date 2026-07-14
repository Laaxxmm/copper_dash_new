// Password hashing — scrypt via node:crypto (no dependency). Node runtime only;
// never imported by middleware (edge), which only verifies the HMAC session.
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const computed = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}
