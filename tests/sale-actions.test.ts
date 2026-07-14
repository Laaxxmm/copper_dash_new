import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { destroyTestDb, useTestDb } from './helpers';

class Redirected extends Error { constructor(public url: string) { super(url); } }
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Redirected(u); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { saveTemplate, saveSaleProduct, deleteTemplate } from '@/lib/sale-actions';
import { createSalePI } from '@/lib/sale-order-actions';
import { templateWithLines, saleProducts, salePIFull } from '@/lib/sale-pricing';
import { all, get, run } from '@/lib/db';

const fd = (o: Record<string, string | number>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, String(v)); return f; };
async function fire(action: (f: FormData) => Promise<void>, o: Record<string, string | number>): Promise<string> {
  try { await action(fd(o)); } catch (e) { if (e instanceof Redirected) return e.url; throw e; }
  throw new Error('no redirect');
}

const LINES = JSON.stringify([
  { label: 'Copper', kind: 'BUY_COST', operator: 'ADD', value: 0 },
  { label: 'Margin', kind: 'FIXED', operator: 'ADD', value: 8 },
  { label: 'bad', kind: 'NONSENSE', operator: 'ADD', value: 1 }, // filtered out
]);

describe('sale-actions', () => {
  beforeAll(useTestDb);
  afterAll(destroyTestDb);

  it('saveTemplate creates a template with only valid lines, then updates in place', async () => {
    const url = await fire(saveTemplate, { template_id: 0, name: 'Resale', notes: 'flat', lines: LINES });
    expect(url).toBe('/sales/pricing');
    const t = all<{ id: number }>(`SELECT id FROM price_templates`)[0];
    const full = templateWithLines(t.id)!;
    expect(full.name).toBe('Resale');
    expect(full.lines).toHaveLength(2); // the NONSENSE line was dropped
    expect(full.lines[1]).toMatchObject({ kind: 'FIXED', value: 8 });
    // edit: same id, lines replaced not duplicated
    await fire(saveTemplate, { template_id: t.id, name: 'Resale v2', lines: JSON.stringify([{ label: 'C', kind: 'BUY_COST', operator: 'ADD', value: 0 }]) });
    const t2 = templateWithLines(t.id)!;
    expect(t2.name).toBe('Resale v2');
    expect(t2.lines).toHaveLength(1);
  });

  it('saveSaleProduct attaches a product to a customer', async () => {
    const cust = Number(run(`INSERT INTO parties (name,type) VALUES ('Cust','CUSTOMER')`).lastInsertRowid);
    const tid = all<{ id: number }>(`SELECT id FROM price_templates`)[0].id;
    await fire(saveSaleProduct, { customer_id: cust, name: '2.5mm wire', template_id: tid, fabrication_cost: 18 });
    const list = saleProducts(cust);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: '2.5mm wire', fabrication_cost: 18 });
  });

  it('refuses to delete a template still used by a product', async () => {
    const tid = all<{ id: number }>(`SELECT id FROM price_templates`)[0].id;
    await fire(deleteTemplate, { template_id: tid });
    expect(templateWithLines(tid)).not.toBeNull(); // still there — in use
  });

  it('createSalePI prices via the template, links the sale to the purchase, and issues the PI', async () => {
    const cust = Number(run(`INSERT INTO parties (name,type,gstin) VALUES ('Buyer','CUSTOMER','24AAA')`).lastInsertRowid);
    const rawId = all<{ id: number }>(`SELECT id FROM products WHERE type='ROD' LIMIT 1`)[0].id;
    // template: buy cost + ₹6 margin
    const tid = Number(run(`INSERT INTO price_templates (name,created_date) VALUES ('Resale','2026-07-01')`).lastInsertRowid);
    run(`INSERT INTO price_lines (template_id,seq,label,kind,operator,value) VALUES (?,0,'buy','BUY_COST','ADD',0)`, tid);
    run(`INSERT INTO price_lines (template_id,seq,label,kind,operator,value) VALUES (?,1,'margin','FIXED','ADD',6)`, tid);
    const spId = Number(run(`INSERT INTO sale_products (customer_id,name,raw_product_id,template_id,fabrication_cost,active,created_date) VALUES (?,?,?,?,0,1,'2026-07-01')`, cust, 'Rod resale', rawId, tid).lastInsertRowid);
    // a priced source purchase at ₹900/kg (900000 ₹/MT)
    const src = Number(run(`INSERT INTO bookings (booking_no,kind,party_id,booking_date,qty_mt,pricing_basis,premium_inr_mt,status,product_id) VALUES ('PB-9','PURCHASE',?,?,10,'MONTH_AVG',0,'OPEN',?)`, cust, '2026-07-01', rawId).lastInsertRowid);
    run(`INSERT INTO price_fixations (booking_id,fixation_date,qty_mt,price_inr_mt,reference) VALUES (?,?,10,900000,'CSP')`, src, '2026-07-01');

    const url = await fire(createSalePI, { customer_id: cust, sale_product_id: spId, qty_mt: 3, source_booking_id: src, sell_basis: 'DAY_PRICE' });
    expect(url).toMatch(/^\/sales\/pi\/\d+$/);
    const pi = salePIFull(Number(url.split('/').pop()))!;
    expect(pi.rate_inr_kg).toBe(906);              // 900 buy + 6 margin
    expect(pi.base_amount).toBe(906 * 3000);       // ₹/kg × kg
    expect(pi.tax_amount).toBe(Math.round(906 * 3000 * 0.18 * 100) / 100);
    expect(pi.source_no).toBe('PB-9');             // linked to the purchase lot
    // a SALE booking was created and priced at the sell rate
    const b = get<{ kind: string; linked_booking_id: number; status: string }>(`SELECT kind, linked_booking_id, status FROM bookings WHERE booking_no = ?`, pi.booking_no!)!;
    expect(b.kind).toBe('SALE');
    expect(b.linked_booking_id).toBe(src);
  });
});
