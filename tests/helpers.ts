// Test database: each test file gets its own temp SQLite file (schema applied
// by lib/db on first open) and one deterministic fixture set, torn down fully
// afterwards so no files or handles leak between runs.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb, getDb, run } from '@/lib/db';

export const isoDaysAgo = (days: number) =>
  new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

let dir: string | null = null;

export function useTestDb() {
  dir = mkdtempSync(join(tmpdir(), 'copperbook-test-'));
  process.env.DATABASE_PATH = join(dir, 'test.db');
  process.env.SEED_DEMO = 'off'; // tests control their own data
  closeDb();
  getDb(); // fresh file → schema applied, but not seeded
}

export function destroyTestDb() {
  closeDb();
  delete process.env.DATABASE_PATH;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
}

export type Fixtures = ReturnType<typeof seedFixtures>;

/** Small, hand-checked trade history. All expected values in tests derive from here. */
export function seedFixtures() {
  const party = (name: string, type: string, credit: number) =>
    Number(run(
      `INSERT INTO parties (name, type, city, contact_person, phone, gstin, credit_days, notes)
       VALUES (?,?,?,?,?,?,?,NULL)`, name, type, 'City', 'CP', '999', '24AAACH1201R1Z5', credit).lastInsertRowid);

  const s1 = party('Supplier A', 'SUPPLIER', 0);
  const s2 = party('Supplier B', 'SUPPLIER', 10);
  const c1 = party('Customer X', 'CUSTOMER', 30);
  const c2 = party('Customer Y', 'CUSTOMER', 60);

  // 60 days of prices rising ₹100/day up to 900,000 today
  for (let i = 59; i >= 0; i--) {
    run(`INSERT INTO csp_prices (price_date, price_inr_mt) VALUES (?,?)`, isoDaysAgo(i), 900000 - i * 100);
  }

  const booking = (no: string, kind: string, partyId: number, daysAgo: number, qty: number,
    basis: string, premium: number, liftByDaysAgo: number | null, status: string, linked: number | null = null) =>
    Number(run(
      `INSERT INTO bookings (booking_no, kind, party_id, booking_date, qty_mt, pricing_basis, premium_inr_mt,
         avg_start, avg_end, lift_by_date, status, linked_booking_id, notes)
       VALUES (?,?,?,?,?,?,?,NULL,NULL,?,?,?,NULL)`,
      no, kind, partyId, isoDaysAgo(daysAgo), qty, basis, premium,
      liftByDaysAgo == null ? null : isoDaysAgo(liftByDaysAgo), status, linked).lastInsertRowid);

  const fixation = (bookingId: number, daysAgo: number, qty: number, rate: number) =>
    run(`INSERT INTO price_fixations (booking_id, fixation_date, qty_mt, price_inr_mt, reference, note)
         VALUES (?,?,?,?, 'NEGOTIATED', NULL)`, bookingId, daysAgo === 0 ? isoDaysAgo(0) : isoDaysAgo(daysAgo), qty, rate);

  const lifting = (bookingId: number, daysAgo: number, qty: number, truck: string, status: string,
    dispatchKg: number, receivedKg: number | null, arrivedDaysAgo: number | null, unloadedDaysAgo: number | null) =>
    Number(run(
      `INSERT INTO liftings (booking_id, dispatch_date, qty_mt, truck_no, transporter, driver_phone,
         eway_bill_no, challan_no, dispatch_weight_kg, received_weight_kg, arrived_date, unloaded_date, unloaded_by, status, note)
       VALUES (?,?,?,?, 'Trans', NULL, 'EWB', 'CH', ?,?,?,?, 'Crew', ?, NULL)`,
      bookingId, isoDaysAgo(daysAgo), qty, truck, dispatchKg, receivedKg,
      arrivedDaysAgo == null ? null : isoDaysAgo(arrivedDaysAgo),
      unloadedDaysAgo == null ? null : isoDaysAgo(unloadedDaysAgo), status).lastInsertRowid);

  const invoice = (no: string, kind: string, partyId: number, bookingId: number, liftingId: number,
    daysAgo: number, qty: number, rate: number, dueDaysAgo: number) => {
    const base = qty * rate, gst = Math.round(base * 0.18);
    return {
      id: Number(run(
        `INSERT INTO invoices (invoice_no, kind, party_id, booking_id, lifting_id, invoice_date,
           qty_mt, rate_inr_mt, base_amount, gst_amount, total_amount, due_date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        no, kind, partyId, bookingId, liftingId, isoDaysAgo(daysAgo), qty, rate, base, gst, base + gst,
        isoDaysAgo(dueDaysAgo)).lastInsertRowid),
      total: base + gst,
    };
  };

  const payment = (direction: string, partyId: number, invoiceId: number, daysAgo: number, amount: number, mode: string, utr: string | null) =>
    run(`INSERT INTO payments (direction, party_id, invoice_id, payment_date, amount, mode, utr_no, bank, note)
         VALUES (?,?,?,?,?,?,?, 'Bank', NULL)`, direction, partyId, invoiceId, isoDaysAgo(daysAgo), amount, mode, utr);

  // PB-001: Supplier A, 10 MT, priced @880k, 6 MT delivered (50 kg short), bill paid in advance
  const pb1 = booking('PB-001', 'PURCHASE', s1, 40, 10, 'DAY_PRICE', 2000, -10, 'OPEN');
  fixation(pb1, 35, 10, 880000);
  const l1 = lifting(pb1, 30, 6, 'TT-01-AA-1111', 'UNLOADED', 6005, 5955, 28, 28);
  const i1 = invoice('SUP/1', 'PURCHASE', s1, pb1, l1, 30, 6, 880000, 30);
  payment('OUT', s1, i1.id, 31, i1.total, 'RTGS', 'UTRTEST1');

  // SB-001: Customer X, 5 MT @900k, back-to-back with PB-001 → margin ₹20,000/MT × 5
  const sb1 = booking('SB-001', 'SALE', c1, 38, 5, 'FIXED', 0, null, 'COMPLETED', pb1);
  fixation(sb1, 36, 5, 900000);
  const l2 = lifting(sb1, 25, 5, 'TT-03-CC-3333', 'UNLOADED', 5000, 4998, 23, 23);
  const i2 = invoice('CB/1', 'SALE', c1, sb1, l2, 25, 5, 900000, -5); // due in 5 days
  payment('IN', c1, i2.id, 10, i2.total / 2, 'NEFT', 'UTRTEST2');     // half paid

  // SB-002: Customer Y, price-later, 2 of 3 MT on the road, nothing priced (open risk)
  const sb2 = booking('SB-002', 'SALE', c2, 8, 3, 'PRICE_LATER', 1000, null, 'OPEN');
  const l3 = lifting(sb2, 5, 2, 'TT-02-BB-2222', 'IN_TRANSIT', 2001, null, null, null);
  const i3 = invoice('CB/2', 'SALE', c2, sb2, l3, 5, 2, 901000, -55);

  // PB-002: Supplier B, month-average, unpriced, 1 MT arrived and waiting to unload
  const pb2 = booking('PB-002', 'PURCHASE', s2, 20, 5, 'MONTH_AVG', 1500, -20, 'OPEN');
  lifting(pb2, 3, 1, 'TT-05-EE-5555', 'ARRIVED', 1002, null, 1, null);

  // SB-003: old finished sale, bill 65 days overdue and unpaid
  const sb3 = booking('SB-003', 'SALE', c1, 100, 2, 'FIXED', 0, null, 'COMPLETED');
  fixation(sb3, 98, 2, 890000);
  const l4 = lifting(sb3, 95, 2, 'TT-04-DD-4444', 'UNLOADED', 2000, 1999, 93, 93);
  const i4 = invoice('CB/0', 'SALE', c1, sb3, l4, 95, 2, 890000, 65);

  return { s1, s2, c1, c2, pb1, pb2, sb1, sb2, sb3, i1, i2, i3, i4 };
}
