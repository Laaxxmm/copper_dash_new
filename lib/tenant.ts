// Per-request tenant context. getDb() opens the current client's business DB
// based on this store. Kept dependency-free (only node:async_hooks) so lib/db
// can import it without pulling next/headers into tests or the CLI seed.
//
// Next renders each route segment (layout, page) as separate async work, so a
// scope entered in the layout does NOT reach page renders. The scope DOES survive
// `await` within one async function, though — so we enter it per entry point
// (each page's body, each server action) via the wrappers in tenant-resolve.ts.
import { AsyncLocalStorage } from 'node:async_hooks';

export type TenantCtx = { clientId: number; dbPath: string; suspended?: boolean };

const als = new AsyncLocalStorage<TenantCtx>();

/** The client whose DB the current request should use, or undefined (→ default DB). */
export function currentTenant(): TenantCtx | undefined {
  return als.getStore();
}

/** Run fn with a tenant bound. No ctx → run as-is (falls back to DATABASE_PATH). */
export function runWithTenant<T>(ctx: TenantCtx | undefined, fn: () => T): T {
  return ctx ? als.run(ctx, fn) : fn();
}
