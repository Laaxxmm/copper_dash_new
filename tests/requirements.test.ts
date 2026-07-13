import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { destroyTestDb, useTestDb } from './helpers';

class Redirected extends Error { constructor(public url: string) { super(url); } }
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Redirected(url); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { addAllocation, addRequirement, cancelAllocation, confirmEnquiry, sendEnquiry } from '@/lib/req-actions';
import { allocations, blended, enquiryMailto, requirement, requirements } from '@/lib/requirements';
import { products } from '@/lib/pricing';
import { get, run } from '@/lib/db';

const fd = (o: Record<string, string | number>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, String(v)); return f; };
async function ends(action: (f: FormData) => Promise<void>, o: Record<string, string | number>): Promise<string> {
  try { await action(fd(o)); } catch (e) { if (e instanceof Redirected) return e.url; throw e; }
  throw new Error('no redirect');
}

let prodId: number, s1: number, s2: number, s3: number, cust: number;

beforeAll(() => {
  useTestDb();
  prodId = products().find((p) => p.type === 'WIRE' && p.size_mm === 1.6)!.id;
  cust = Number(run(`INSERT INTO parties (name,type) VALUES ('Cust','CUSTOMER')`).lastInsertRowid);
  const mk = (n: string, prem: number) => {
    const id = Number(run(`INSERT INTO parties (name,type,exchange_basis) VALUES (?, 'SUPPLIER','RBI_TT')`, n).lastInsertRowid);
    run(`INSERT INTO supplier_terms (supplier_id,product_id,premium_usd_mt,factor_pct,handling_inr_mt) VALUES (?,?,?,5.5,6100)`, id, prodId, prem);
    return id;
  };
  s1 = mk('S1', 150); s2 = mk('S2', 200); s3 = mk('S3', 250);
  run(`INSERT INTO lme_prices (price_date, usd_mt) VALUES (date('now'), 13300)`);
  run(`INSERT INTO fx_rates (rate_date, basis, usd_inr) VALUES (date('now'),'RBI_TT',89)`);
});
afterAll(destroyTestDb);

describe('requirement / split lifecycle', () => {
  let reqId: number;

  it('creates a 25 MT requirement, OPEN with nothing sourced', async () => {
    const url = await ends(addRequirement, { product_id: prodId, qty: 25, customer_id: cust, target_sell: 1265 });
    reqId = Number(url.split('/').pop());
    const r = requirement(reqId)!;
    expect(r.qty_mt).toBe(25);
    expect(r.sourced).toBe(0);
    expect(r.remaining).toBe(25);
    expect(r.status).toBe('OPEN');
  });

  it('splits 5 / 10 / 10 across suppliers → sourced 25, remaining 0, FILLED', async () => {
    await ends(addAllocation, { requirement_id: reqId, supplier_id: s1, qty: 5 });
    await ends(addAllocation, { requirement_id: reqId, supplier_id: s2, qty: 10 });
    await ends(addAllocation, { requirement_id: reqId, supplier_id: s3, qty: 10 });
    const r = requirement(reqId)!;
    expect(r.sourced).toBe(25);
    expect(r.remaining).toBe(0);
    expect(r.status).toBe('FILLED');
  });

  it('each leg links to a purchase booking and snapshots its L-tier', () => {
    const legs = allocations(reqId);
    expect(legs).toHaveLength(3);
    expect(legs.every((l) => l.booking_no?.startsWith('PB-'))).toBe(true);
    expect(legs[0].tier_label).toBe('L1'); // cheapest premium (S1) ranks L1
    expect(legs[0].supplier).toBe('S1');
  });

  it('refuses to over-source beyond the requirement', async () => {
    const url = await ends(addAllocation, { requirement_id: reqId, supplier_id: s1, qty: 3 });
    expect(decodeURIComponent(url)).toMatch(/still to be sourced/);
  });

  it('cancelling a leg frees the quantity and cancels its booking', async () => {
    const leg = allocations(reqId).find((l) => l.supplier === 'S2')!;
    await ends(cancelAllocation, { allocation_id: leg.id, requirement_id: reqId });
    const r = requirement(reqId)!;
    expect(r.sourced).toBe(15);          // 25 - 10
    expect(r.remaining).toBe(10);
    expect(r.status).toBe('PARTIAL');
    expect(get<{ status: string }>(`SELECT status FROM bookings WHERE id=?`, leg.booking_id!)!.status).toBe('CANCELLED');
  });

  it('blends the cost across live legs', () => {
    const b = blended(reqId);
    expect(b.provisional.qty).toBe(15);  // S1 5 + S3 10 (S2 cancelled)
    expect(b.provisional.rate).toBeGreaterThan(1200);
  });

  it('lists the requirement with its live balance', () => {
    const row = requirements().find((r) => r.id === reqId)!;
    expect(row.sourced).toBe(15);
    expect(row.remaining).toBe(10);
  });
});

describe('ordering slip (Phase 3)', () => {
  let reqId: number;
  beforeAll(async () => {
    const url = await ends(addRequirement, { product_id: prodId, qty: 6 });
    reqId = Number(url.split('/').pop());
  });

  it('sending an enquiry records an ENQUIRY leg with no booking', async () => {
    await ends(sendEnquiry, { requirement_id: reqId, supplier_id: s1, qty: 6 });
    const [leg] = allocations(reqId);
    expect(leg.status).toBe('ENQUIRY');
    expect(leg.booking_id).toBeNull();
    expect(leg.sent_at).not.toBeNull();
    expect(requirement(reqId)!.status).toBe('FILLED'); // sourced counts enquiries too
  });

  it('confirming the PI creates the booking and advances the leg', async () => {
    const leg = allocations(reqId)[0];
    await ends(confirmEnquiry, { allocation_id: leg.id, requirement_id: reqId });
    const after = allocations(reqId)[0];
    expect(after.status).toBe('PI_RECEIVED');
    expect(after.booking_no).toMatch(/^PB-/);
  });

  it('builds a correctly-addressed mailto', () => {
    const m = enquiryMailto({ email: 'sales@acme.com', supplier: 'Acme', reqNo: 'REQ-1', product: '1.60 mm wire', qty: 5, needBy: '2026-07-20', rate: 1250 });
    expect(m.startsWith('mailto:sales@acme.com?subject=')).toBe(true);
    expect(decodeURIComponent(m)).toContain('5 MT 1.60 mm wire');
    expect(decodeURIComponent(m)).toContain('Please send your PI');
  });
});
