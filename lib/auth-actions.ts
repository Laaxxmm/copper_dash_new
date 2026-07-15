'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from './auth';
import { userByUsername, recordLoginAttempt, touchLastLogin, recentFailures } from './control-db';
import { verifyPassword } from './password';

// Auth actions touch only the control DB + cookies (no tenant business DB), so
// they are NOT tenant-wrapped — and must stay usable even when the caller's
// account is locked (so they can reach the login screen and sign out).
export async function login(formData: FormData) {
  const user = String(formData.get('user') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/') || '/';
  const fail = () => redirect(`/login?err=1${next && next !== '/' ? `&next=${encodeURIComponent(next)}` : ''}`);

  // Simple lockout: too many recent failures for this username.
  if (recentFailures(user) >= 8) redirect('/login?err=locked');

  const u = userByUsername(user);
  const ok = !!u && u.status === 'active' && verifyPassword(password, u.password_hash, u.salt);
  recordLoginAttempt(user, ok);
  if (!ok || !u) fail();

  touchLastLogin(u!.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(String(u!.id)), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  redirect(next.startsWith('/') ? next : '/');
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
