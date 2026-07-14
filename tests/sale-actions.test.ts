import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { destroyTestDb, useTestDb } from './helpers';

class Redirected extends Error { constructor(public url: string) { super(url); } }
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Redirected(u); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { saveTemplate, saveSaleProduct, deleteTemplate } from '@/lib/sale-actions';
import { templateWithLines, saleProducts } from '@/lib/sale-pricing';
import { all, run } from '@/lib/db';

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
});
