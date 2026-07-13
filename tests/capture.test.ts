import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { destroyTestDb, useTestDb } from './helpers';

class Redirected extends Error { constructor(public url: string) { super(url); } }
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Redirected(u); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { parseDoc, pendingCaptures } from '@/lib/capture';
import { captureEmail, confirmCapture } from '@/lib/capture-actions';
import { products } from '@/lib/pricing';
import { get, run } from '@/lib/db';
import { today } from '@/lib/format';

const fd = (o: Record<string, string | number>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, String(v)); return f; };
async function fire(action: (f: FormData) => Promise<void>, o: Record<string, string | number>): Promise<string> {
  try { await action(fd(o)); } catch (e) { if (e instanceof Redirected) return e.url; throw e; }
  throw new Error('no redirect');
}

// A realistic PI whose components reproduce its printed total (verified engine).
const PI = `SAVLI COPPER PRODUCTS PVT LTD  PROFORMA INVOICE NO. : 50004331  Date : Jul 13, 2026
Hindalco 5.75MM EC CU WIRE  4,178 KG  1365.46  5704891.88
LME Price USD 13508.50 Per 1000 KG + Premium USD 180.00 Per 1000 KG + Transaction USD 0.00 Per 1000 KG * Exchange @ 95.71 * Factor 3.75% + Handling INR 6200.00 Per 1000 KG
GST % 18.00  IGST : 1026880.54  Total Net Value : 6731772.42`;

describe('parseDoc', () => {
  it('extracts the PI fields and recomputes the rate to the paise', () => {
    const p = parseDoc(PI);
    expect(p.doc_type).toBe('PI');
    expect(p.reference_no).toBe('50004331');
    expect(p.qty_mt).toBe(4.178);
    expect(p.lme_usd_mt).toBe(13508.5);
    expect(p.premium_usd_mt).toBe(180);
    expect(p.factor_pct).toBe(3.75);
    expect(p.exchange_rate).toBe(95.71);
    expect(p.handling_inr_mt).toBe(6200);
    expect(p.computed_rate_inr_kg).toBe(1365.46);
    expect(p.mismatch).toBe(false); // recomputed total matches the printed total
  });

  it('flags an amount mismatch when the printed total does not add up', () => {
    const p = parseDoc(PI.replace('6731772.42', '6000000.00'));
    expect(p.mismatch).toBe(true);
  });

  it('classifies a cancellation', () => {
    expect(parseDoc('Please CANCEL our order 50004331, thanks').doc_type).toBe('CANCEL');
  });
});

describe('capture → match → confirm', () => {
  let allocId: number;

  beforeAll(() => {
    useTestDb();
    const prodId = products().find((p) => p.type === 'WIRE' && p.size_mm === 5.75)!.id;
    const sup = Number(run(`INSERT INTO parties (name,type,exchange_basis) VALUES ('Hindalco','SUPPLIER','RBI_TT')`).lastInsertRowid);
    run(`INSERT INTO supplier_terms (supplier_id,product_id,premium_usd_mt,factor_pct,handling_inr_mt) VALUES (?,?,180,3.75,6200)`, sup, prodId);
    run(`INSERT INTO lme_prices (price_date, usd_mt) VALUES (date('now'), 13508)`);
    run(`INSERT INTO fx_rates (rate_date, basis, usd_inr) VALUES (date('now'),'RBI_TT',95.71)`);
    const reqId = Number(run(`INSERT INTO requirements (req_no,product_id,qty_mt,status,created_date) VALUES ('REQ-X',?,10,'PARTIAL',?)`, prodId, today()).lastInsertRowid);
    allocId = Number(run(`INSERT INTO allocations (requirement_id,supplier_id,tier_label,qty_mt,rate_inr_kg,status,created_date,sent_at) VALUES (?,?,'L1',4.178,1300,'ENQUIRY',?,?)`, reqId, sup, today(), today()).lastInsertRowid);
  });
  afterAll(destroyTestDb);

  it('stages a pasted PI, matched to the open enquiry, nothing booked yet', async () => {
    await fire(captureEmail, { text: PI });
    const q = pendingCaptures();
    expect(q).toHaveLength(1);
    expect(q[0].status).toBe('PENDING');
    expect(q[0].matched_allocation_id).toBe(allocId);
    expect(q[0].supplier).toBe('Hindalco');
    // still an enquiry — capture never posts on its own
    expect(get<{ status: string }>(`SELECT status FROM allocations WHERE id=?`, allocId)!.status).toBe('ENQUIRY');
  });

  it('confirming books the enquiry at the PI rate', async () => {
    const cap = pendingCaptures()[0];
    await fire(confirmCapture, { capture_id: cap.id });
    const a = get<{ status: string; rate_inr_kg: number; booking_id: number | null }>(`SELECT status, rate_inr_kg, booking_id FROM allocations WHERE id=?`, allocId)!;
    expect(a.status).toBe('PI_RECEIVED');
    expect(a.booking_id).not.toBeNull();
    expect(a.rate_inr_kg).toBe(1365.46);         // took the PI's recomputed rate
    expect(pendingCaptures()).toHaveLength(0);   // left the queue
  });

  it('a MISMATCH capture does not post until reviewed', async () => {
    // reset a fresh enquiry
    const prodId = products().find((p) => p.type === 'WIRE' && p.size_mm === 5.75)!.id;
    const reqId = Number(run(`INSERT INTO requirements (req_no,product_id,qty_mt,status,created_date) VALUES ('REQ-Y',?,5,'PARTIAL',?)`, prodId, today()).lastInsertRowid);
    const sup = get<{ id: number }>(`SELECT id FROM parties WHERE name='Hindalco'`)!.id;
    run(`INSERT INTO allocations (requirement_id,supplier_id,qty_mt,status,created_date) VALUES (?,?,4.178,'ENQUIRY',?)`, reqId, sup, today());
    await fire(captureEmail, { text: PI.replace('6731772.42', '6000000.00') });
    const cap = pendingCaptures().find((c) => c.matched_requirement_id === reqId)!;
    expect(cap.status).toBe('MISMATCH');
  });
});
