// Simple single-user auth. Credentials and secret come from env with safe
// defaults (admin / admin123). The session is an HMAC-signed cookie, verified
// in both the Node runtime (server actions) and the edge runtime (middleware)
// via Web Crypto — no external dependency.

export const SESSION_COOKIE = 'cb_session';
export const IMPERSONATE_COOKIE = 'cb_impersonate'; // super-admin "open as client" (signed clientId)
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SECRET = process.env.AUTH_SECRET || 'copperbook-dev-secret-change-me';

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): string {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(pad + '==='.slice((pad.length + 3) % 4));
}

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return b64url(new Uint8Array(sig));
}

/** Constant-time-ish string compare. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkCredentials(user: string, password: string): boolean {
  return safeEqual(user, ADMIN_USER) && safeEqual(password, ADMIN_PASSWORD);
}

/** Cookie value = base64url(user).base64url(hmac(user)). */
export async function signSession(user: string): Promise<string> {
  const payload = b64url(enc.encode(user));
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySession(value: string | undefined | null): Promise<string | null> {
  if (!value || !value.includes('.')) return null;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  const expected = await hmac(payload);
  if (!safeEqual(sig, expected)) return null;
  try { return fromB64url(payload); } catch { return null; }
}
