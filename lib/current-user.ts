// Server-side session → user. One source of truth: resolveSession() reads the
// cookie, looks up the control DB, and returns a user only when access is 'ok'
// (active user, active client). Node runtime (server components / actions).
import { resolveSession } from './tenant-resolve';
import type { ControlUser } from './control-db';

export async function currentUser(): Promise<ControlUser | null> {
  const s = await resolveSession();
  return s && s.access === 'ok' ? s.user : null;
}

export async function requireSuperAdmin(): Promise<ControlUser> {
  const u = await currentUser();
  if (!u || u.role !== 'SUPER_ADMIN') {
    const { redirect } = await import('next/navigation');
    redirect('/');
  }
  return u!;
}
