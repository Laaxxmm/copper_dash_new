// Server-side session → user resolution. The cookie signs only the userId; the
// role/client/status are resolved here from the control DB each request, so a
// tampered cookie can't elevate. Node runtime (server components / actions).
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySession } from './auth';
import { userById, type ControlUser } from './control-db';

export async function currentUser(): Promise<ControlUser | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = await verifySession(raw);
  const id = Number(payload);
  if (!id || !Number.isFinite(id)) return null;
  const u = userById(id);
  if (!u || u.status !== 'active') return null;
  return u;
}

export async function requireSuperAdmin(): Promise<ControlUser> {
  const u = await currentUser();
  if (!u || u.role !== 'SUPER_ADMIN') {
    const { redirect } = await import('next/navigation');
    redirect('/');
  }
  return u!;
}
