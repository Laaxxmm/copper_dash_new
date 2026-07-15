// Resolve the session (user + client + tenant DB + access verdict) from the
// cookie, and wrappers that bind that tenant around a page render / server
// action so getDb() inside targets the right client DB. Server-only.
import 'server-only';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySession } from './auth';
import { userById, clientById, clientSettings, DEFAULT_SETTINGS, type ControlUser, type ClientSettings } from './control-db';
import { runWithTenant, type TenantCtx } from './tenant';

export type Access = 'ok' | 'user-locked' | 'client-suspended';
export type SessionInfo = { userId: number; user: ControlUser; tenant?: TenantCtx; access: Access; settings: ClientSettings };

/** The whole session in one cache()'d control-DB read per request. A client
 *  user is ALWAYS bound to their own client's DB — even when locked or their
 *  client is suspended — so there is never a cross-tenant read; access is a
 *  separate verdict the layout and actions enforce. Never throws. */
export const resolveSession = cache(async (): Promise<SessionInfo | null> => {
  try {
    const raw = (await cookies()).get(SESSION_COOKIE)?.value;
    const id = Number(await verifySession(raw));
    if (!id || !Number.isFinite(id)) return null;
    const user = userById(id);
    if (!user) return null;
    if (user.client_id == null) { // global super-admin: no client → default DB
      return { userId: id, user, tenant: undefined, access: user.status === 'active' ? 'ok' : 'user-locked', settings: DEFAULT_SETTINGS };
    }
    const c = clientById(user.client_id);
    if (!c || !c.db_path) return null;
    const tenant: TenantCtx = { clientId: c.id, dbPath: c.db_path };
    const access: Access = user.status !== 'active' ? 'user-locked' : c.status === 'suspended' ? 'client-suspended' : 'ok';
    return { userId: id, user, tenant, access, settings: clientSettings(c.id) };
  } catch {
    return null;
  }
});

/** Which client DB getDb() should open — the caller's own, or undefined → default. */
export async function resolveTenant(): Promise<TenantCtx | undefined> {
  return (await resolveSession())?.tenant;
}

/** Wrap a server action / route handler: bind the caller's client DB, and refuse
 *  to run for a locked user or suspended client. */
export function withTenant<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const s = await resolveSession();
    if (s && s.access !== 'ok') redirect('/'); // blocked → bounce to the notice (throws)
    return runWithTenant(s?.tenant, () => fn(...args));
  };
}

/** Wrap a page/layout server component so DB access in its body targets the caller's client DB.
 *  (Data must be fetched in the component body, not a nested async child — the scope survives
 *  awaits in one function but not a separately-rendered child segment.) */
export function withTenantPage<P>(Page: (props: P) => ReactNode | Promise<ReactNode>): (props: P) => Promise<ReactNode> {
  return async (props: P) => runWithTenant((await resolveSession())?.tenant, () => Page(props));
}
