'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, SESSION_MAX_AGE, checkCredentials, signSession } from './auth';

export async function login(formData: FormData) {
  const user = String(formData.get('user') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/') || '/';

  if (!checkCredentials(user, password)) {
    redirect(`/login?err=1${next && next !== '/' ? `&next=${encodeURIComponent(next)}` : ''}`);
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(user), {
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
