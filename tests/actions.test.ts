import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { destroyTestDb, isoDaysAgo, useTestDb } from './helpers';

// Server actions end every path with redirect() (which never returns in Next).
// The mock throws a marker so tests can assert exactly where each call landed.
class Redirected extends Error {
  constructor(public url: string) { super(`redirect:${url}`); }
}
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Redirected(url); },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { addBooking, addFixation, addLifting, addParty, addPayment, saveCsp, saveLme, saveSupplierPlan, updateTruck } from '@/lib/actions';
import { all, get, run } from '@/lib/db';

const fd = (fields: Record<string, string | number>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, String(v));
  return f;
};

/** Run an action, return the redirect URL it ended on. */
async function endsAt(action: (f: FormData) => Promise<void>, fields: Record<string, string | number>): Promise<string> {
  try {
    await action(fd(fields));
  } catch (e) {
    if (e instanceof Redirected) return e.url;
    throw e;
  }
  throw new Error('action did not redirect');
}
const isError = (url: string) => url.includes('err=');

let supplierId: number;
let customerId: number;

beforeAll(() => {
  useTestDb();
  supplierId = Number(run(
    `INSERT INTO parties (name, type, city, credit_days) VALUES ('Test Supplier', 'SUPPLIER', 'X', 10)`).lastInsertRowid);
  customerId = Number(run(
    `INSERT INTO parties (name, type, city, credit_days) VALUES ('Test Customer', 'CUSTOMER', 'Y', 30)`).lastInsertRowid);
  run(`INSERT INTO csp_prices (price_date, price_inr_mt) VALUES (?, 900000)`, isoDaysAgo(0));
});
afterAll(destroyTestDb);

describe('addParty', () => {
  it('rejects a malformed GSTIN with a plain message', async () => {
    const url = await endsAt(addParty, { type: 'CUSTOMER', name: 'Bad GST Firm', gstin: 'NOT-A-GSTIN' });
    expect(url).toContain('/add?what=party');
    expect(decodeURIComponent(url)).toContain('GSTIN');
  });

  it('rejects duplicate firm names', async () => {
    const url = await endsAt(addParty, { type: 'SUPPLIER', name: 'test supplier' }); // case-insensitive
    expect(isError(url)).toBe(true);
  });

  it('saves a valid firm and lands on People', async () => {
    const url = await endsAt(addParty, {
      type: 'CUSTOMER', name: 'Ganga Wires', city: 'Madurai', gstin: '33AABCE7723M1Z1', credit_days: 45,
    });
    expect(url).toBe('/parties');
    expect(get(`SELECT credit_days FROM parties WHERE name = 'Ganga Wires'`)).toMatchObject({ credit_days: 45 });
  });
});

describe('addBooking', () => {
  it('refuses a sale booked against a supplier', async () => {
    const url = await endsAt(addBooking, { kind: 'SALE', party_id: supplierId, qty: 2, basis: 'FIXED', premium: 0 });
    expect(isError(url)).toBe(true);
  });

  it('creates a purchase with a computed month-average window and sequential number', async () => {
    const url = await endsAt(addBooking, {
      kind: 'PURCHASE', party_id: supplierId, qty: 3, basis: 'MONTH_AVG', premium: 2000, date: '2026-07-11',
    });
    expect(url).toBe('/bookings?kind=PURCHASE&status=OPEN');
    const b = get<{ booking_no: string; avg_start: string; avg_end: string }>(
      `SELECT booking_no, avg_start, avg_end FROM bookings WHERE pricing_basis = 'MONTH_AVG'`)!;
    expect(b.booking_no).toBe('PB-001');
    expect(b.avg_start).toBe('2026-07-01');
    expect(b.avg_end).toBe('2026-07-31');
  });
});

describe('the booking → price → truck → bill → payment chain', () => {
  let bookingId: number;

  it('books 4 MT with the supplier', async () => {
    await endsAt(addBooking, { kind: 'PURCHASE', party_id: supplierId, qty: 4, basis: 'DAY_PRICE', premium: 1000 });
    bookingId = Number(get<{ id: number }>(`SELECT id FROM bookings WHERE booking_no = 'PB-002'`)!.id);
  });

  it('refuses to price more than the booked balance', async () => {
    const url = await endsAt(addFixation, { booking_id: bookingId, qty: 5, rate: 905000 });
    expect(decodeURIComponent(url)).toContain('4');
  });

  it('fixes the full quantity', async () => {
    await endsAt(addFixation, { booking_id: bookingId, qty: 4, rate: 905000 });
    expect(get(`SELECT SUM(qty_mt) q FROM price_fixations WHERE booking_id = ?`, bookingId)).toMatchObject({ q: 4 });
  });

  it('dispatches a truck and writes the bill automatically (rate, GST, due date)', async () => {
    const url = await endsAt(addLifting, {
      booking_id: bookingId, qty: 4, truck_no: 'ka-01-zz-1234', transporter: 'T', date: isoDaysAgo(0),
    });
    expect(url).toBe('/trucks?status=IN_TRANSIT');
    const inv = get<{ rate_inr_mt: number; base_amount: number; gst_amount: number; total_amount: number; due_date: string }>(
      `SELECT rate_inr_mt, base_amount, gst_amount, total_amount, due_date FROM invoices WHERE booking_id = ?`, bookingId)!;
    expect(inv.rate_inr_mt).toBe(905000);                          // uses the fixed rate
    expect(inv.base_amount).toBe(4 * 905000);
    expect(inv.gst_amount).toBe(Math.round(4 * 905000 * 0.18));
    expect(inv.total_amount).toBe(inv.base_amount + inv.gst_amount);
    expect(inv.due_date).toBe(isoDaysAgo(-10));                    // supplier gives 10 days credit
    expect(get(`SELECT truck_no FROM liftings WHERE booking_id = ?`, bookingId)).toMatchObject({ truck_no: 'KA-01-ZZ-1234' });
  });

  it('marks the booking finished once fully priced and fully moved', () => {
    expect(get(`SELECT status FROM bookings WHERE id = ?`, bookingId)).toMatchObject({ status: 'COMPLETED' });
  });

  it('refuses an unloading weight above what was sent', async () => {
    const lift = get<{ id: number }>(`SELECT id FROM liftings WHERE booking_id = ?`, bookingId)!;
    const url = await endsAt(updateTruck, { lifting_id: lift.id, event: 'UNLOADED', received_kg: 4200 });
    expect(isError(url)).toBe(true);
  });

  it('records unloading with the received weight', async () => {
    const lift = get<{ id: number }>(`SELECT id FROM liftings WHERE booking_id = ?`, bookingId)!;
    await endsAt(updateTruck, { lifting_id: lift.id, event: 'UNLOADED', received_kg: 3985, unloaded_by: 'Ravi' });
    expect(get(`SELECT status, received_weight_kg FROM liftings WHERE id = ?`, lift.id))
      .toMatchObject({ status: 'UNLOADED', received_weight_kg: 3985 });
  });

  it('demands the UTR for bank transfers', async () => {
    const inv = get<{ id: number }>(`SELECT id FROM invoices WHERE booking_id = ?`, bookingId)!;
    const url = await endsAt(addPayment, { invoice_id: inv.id, amount: 1000, mode: 'RTGS' });
    expect(decodeURIComponent(url)).toContain('UTR');
  });

  it('refuses to overpay a bill', async () => {
    const inv = get<{ id: number; total_amount: number }>(`SELECT id, total_amount FROM invoices WHERE booking_id = ?`, bookingId)!;
    const url = await endsAt(addPayment, { invoice_id: inv.id, amount: inv.total_amount + 100, mode: 'RTGS', utr: 'U1' });
    expect(isError(url)).toBe(true);
  });

  it('records a valid payment with direction inferred from the bill', async () => {
    const inv = get<{ id: number; total_amount: number }>(`SELECT id, total_amount FROM invoices WHERE booking_id = ?`, bookingId)!;
    const url = await endsAt(addPayment, { invoice_id: inv.id, amount: inv.total_amount, mode: 'RTGS', utr: 'UTRX1' });
    expect(url).toBe('/money');
    expect(get(`SELECT direction, utr_no FROM payments WHERE invoice_id = ?`, inv.id))
      .toMatchObject({ direction: 'OUT', utr_no: 'UTRX1' });
  });
});

describe('saveCsp', () => {
  it('upserts the day price', async () => {
    await endsAt(saveCsp, { date: '2026-07-12', price: 910000 });
    await endsAt(saveCsp, { date: '2026-07-12', price: 912000 });
    expect(all(`SELECT price_inr_mt FROM csp_prices WHERE price_date = '2026-07-12'`)).toEqual([{ price_inr_mt: 912000 }]);
  });

  it('rejects a price that cannot be ₹/MT', async () => {
    const url = await endsAt(saveCsp, { date: '2026-07-12', price: 900 });
    expect(isError(url)).toBe(true);
  });
});

describe('saveLme', () => {
  it('upserts the day LME as a confirmed manual value', async () => {
    const url = await endsAt(saveLme, { date: '2026-07-12', usd_mt: 13500 });
    expect(url).toBe('/where-to-buy');
    await endsAt(saveLme, { date: '2026-07-12', usd_mt: 13620 });
    expect(all(`SELECT usd_mt, source FROM lme_prices WHERE price_date = '2026-07-12'`))
      .toEqual([{ usd_mt: 13620, source: 'manual' }]);
  });

  it('rejects a value that cannot be US$/MT', async () => {
    expect(isError(await endsAt(saveLme, { date: '2026-07-12', usd_mt: 135 }))).toBe(true);
  });
});

describe('saveSupplierPlan', () => {
  it('sets manual rank and upserts the monthly per-product target', async () => {
    const pid = get<{ id: number }>(`SELECT id FROM products LIMIT 1`)!.id;
    const sup = get<{ id: number }>(`SELECT id FROM parties WHERE type='SUPPLIER' LIMIT 1`)!.id;
    const url = await endsAt(saveSupplierPlan, { supplier_id: sup, product_id: pid, month: '2026-07', rank: 2, target_mt: 30, agreed_mt: 25 });
    expect(url).toBe(`/suppliers?month=2026-07&product=${pid}`);
    expect(get(`SELECT manual_rank FROM parties WHERE id=?`, sup)).toEqual({ manual_rank: 2 });
    expect(get(`SELECT target_mt, agreed_mt FROM supplier_targets WHERE supplier_id=? AND product_id=? AND month='2026-07'`, sup, pid))
      .toEqual({ target_mt: 30, agreed_mt: 25 });
    // upsert: rank 0 clears the rank, target updates in place (no duplicate row)
    await endsAt(saveSupplierPlan, { supplier_id: sup, product_id: pid, month: '2026-07', rank: 0, target_mt: 40, agreed_mt: 40 });
    expect(get(`SELECT manual_rank FROM parties WHERE id=?`, sup)).toEqual({ manual_rank: null });
    expect(all(`SELECT target_mt FROM supplier_targets WHERE supplier_id=? AND product_id=? AND month='2026-07'`, sup, pid))
      .toEqual([{ target_mt: 40 }]);
  });
});
