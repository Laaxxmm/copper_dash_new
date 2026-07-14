// Multi-tenant isolation: getDb() opens the DB bound by the current tenant
// scope, and two tenants never see each other's rows. This is the security
// boundary of the whole platform, so it gets its own proof.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb, all, get, run } from '@/lib/db';
import { runWithTenant, currentTenant } from '@/lib/tenant';

let dir: string;
let dbDefault: string, dbA: string, dbB: string;
const ctx = (dbPath: string, clientId: number) => ({ clientId, dbPath });

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'copperbook-tenant-'));
  dbDefault = join(dir, 'default.db');
  dbA = join(dir, 'tenantA.db');
  dbB = join(dir, 'tenantB.db');
  process.env.DATABASE_PATH = dbDefault;
  process.env.SEED_DEMO = 'off';
  closeDb();
});

afterAll(() => {
  closeDb();
  delete process.env.DATABASE_PATH;
  rmSync(dir, { recursive: true, force: true });
});

const insert = (name: string) => run(`INSERT INTO parties (name, type) VALUES (?, 'SUPPLIER')`, name);
const names = () => all<{ name: string }>(`SELECT name FROM parties ORDER BY name`).map((r) => r.name);

describe('tenant isolation', () => {
  it('writes land in the DB bound by the active tenant (or the default with no scope)', () => {
    insert('Default Co'); // no scope → DATABASE_PATH
    runWithTenant(ctx(dbA, 1), () => insert('Alpha Metals'));
    runWithTenant(ctx(dbB, 2), () => insert('Beta Copper'));

    expect(runWithTenant(ctx(dbA, 1), names)).toEqual(['Alpha Metals']);
    expect(runWithTenant(ctx(dbB, 2), names)).toEqual(['Beta Copper']);
    expect(names()).toEqual(['Default Co']);
  });

  it('does not leak across tenants', () => {
    const aSeesBeta = runWithTenant(ctx(dbA, 1), () => get(`SELECT 1 x FROM parties WHERE name = 'Beta Copper'`));
    const bSeesAlpha = runWithTenant(ctx(dbB, 2), () => get(`SELECT 1 x FROM parties WHERE name = 'Alpha Metals'`));
    expect(aSeesBeta).toBeUndefined();
    expect(bSeesAlpha).toBeUndefined();
  });

  it('scope survives awaits and clears afterwards', async () => {
    expect(currentTenant()).toBeUndefined();
    const seen = await runWithTenant(ctx(dbA, 9), async () => {
      await new Promise((r) => setTimeout(r, 1));
      return currentTenant()?.dbPath; // still bound after the await
    });
    expect(seen).toBe(dbA);
    expect(currentTenant()).toBeUndefined();
  });
});
