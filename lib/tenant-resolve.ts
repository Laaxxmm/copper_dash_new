// Resolve the logged-in user's client → business DB path from the session
// cookie, and wrappers that bind that tenant around a page render / server
// action so getDb() inside targets the right client DB. Server-only.
import 'server-only';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { SESSION_COOKIE, verifySession } from './auth';
import { userById, clientById } from './control-db';
import { runWithTenant, type TenantCtx } from './tenant';

/** cache()'d: one control-DB lookup per request even if called from many places.
 *  Never throws — outside a request scope (tests, CLI) it returns undefined so
 *  getDb() falls back to the default DB. */
export const resolveTenant = cache(async (): Promise<TenantCtx | undefined> => {
  try {
    const raw = (await cookies()).get(SESSION_COOKIE)?.value;
    const id = Number(await verifySession(raw));
    if (!id || !Number.isFinite(id)) return undefined;
    const u = userById(id);
    if (!u || u.status !== 'active' || u.client_id == null) return undefined; // global super-admin → default DB
    const c = clientById(u.client_id);
    if (!c || !c.db_path) return undefined;
    // Always bind to the client's own DB (even if suspended) so there's never a
    // cross-tenant read; suspension is enforced as an access block, not a fallback.
    return { clientId: c.id, dbPath: c.db_path, suspended: c.status === 'suspended' };
  } catch {
    return undefined;
  }
});

/** Wrap a server action / route handler so getDb() inside hits the caller's client DB. */
export function withTenant<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A) => runWithTenant(await resolveTenant(), () => fn(...args));
}

/** Wrap a page/layout server component so DB access in its body targets the caller's client DB.
 *  (Data must be fetched in the component body, not a nested async child — the scope survives
 *  awaits in one function but not a separately-rendered child segment.) */
export function withTenantPage<P>(Page: (props: P) => ReactNode | Promise<ReactNode>): (props: P) => Promise<ReactNode> {
  return async (props: P) => runWithTenant(await resolveTenant(), () => Page(props));
}
