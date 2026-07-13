// Shared requirement/allocation helpers (no 'use server' — plain functions the
// server actions in req-actions.ts and capture-actions.ts both call).
import { get, run } from './db';
import { ratePerKg } from './formula';
import { fxRate, latestLme } from './pricing';
import { today } from './format';

export type Terms = { premium_usd_mt: number; transaction_usd_mt: number; factor_pct: number; handling_inr_mt: number };

export const supplierTerms = (supplierId: number, productId: number): Terms =>
  get<Terms>(`SELECT premium_usd_mt, transaction_usd_mt, factor_pct, handling_inr_mt FROM supplier_terms WHERE supplier_id = ? AND product_id = ?`,
    supplierId, productId) ?? { premium_usd_mt: 0, transaction_usd_mt: 0, factor_pct: 0, handling_inr_mt: 0 };

export const engineRate = (supplierId: number, st: Terms) => {
  const basis = get<{ b: string }>(`SELECT exchange_basis b FROM parties WHERE id = ?`, supplierId)?.b ?? 'RBI_TT';
  return ratePerKg({ lme_usd_mt: latestLme()?.usd_mt ?? 0, exchange_rate: fxRate(basis), ...st });
};

export function nextPb(): string {
  const n = get<{ c: number }>(`SELECT COUNT(*) c FROM bookings WHERE booking_no LIKE 'PB-%'`)!.c;
  return `PB-${String(n + 1).padStart(3, '0')}`;
}

/** Recompute OPEN/PARTIAL/FILLED from live allocations (leaves a CANCELLED requirement alone). */
export function recompute(reqId: number) {
  const r = get<{ qty_mt: number; status: string; sourced: number }>(
    `SELECT qty_mt, status,
            IFNULL((SELECT SUM(qty_mt) FROM allocations WHERE requirement_id = ? AND status != 'CANCELLED'), 0) sourced
     FROM requirements WHERE id = ?`, reqId, reqId);
  if (!r || r.status === 'CANCELLED') return;
  run(`UPDATE requirements SET status = ? WHERE id = ?`,
    r.sourced >= r.qty_mt - 0.001 ? 'FILLED' : r.sourced > 0 ? 'PARTIAL' : 'OPEN', reqId);
}

/** Create the provisional (price-later) purchase booking for a leg. */
export function bookLeg(supplierId: number, productId: number, qty: number, note: string): number {
  const st = supplierTerms(supplierId, productId);
  return Number(run(
    `INSERT INTO bookings (booking_no, kind, party_id, booking_date, qty_mt, pricing_basis, premium_inr_mt,
       avg_start, avg_end, lift_by_date, status, linked_booking_id, notes,
       premium_usd_mt, transaction_usd_mt, factor_pct, handling_inr_mt, product_id)
     VALUES (?, 'PURCHASE', ?, ?, ?, 'PRICE_LATER', 0, NULL, NULL, NULL, 'OPEN', NULL, ?, ?, ?, ?, ?, ?)`,
    nextPb(), supplierId, today(), qty, note, st.premium_usd_mt, st.transaction_usd_mt, st.factor_pct, st.handling_inr_mt, productId).lastInsertRowid);
}

/** Turn an ENQUIRY leg into a booked (PI-received) leg. Returns the booking id, or null if not an open enquiry. */
export function bookEnquiry(allocId: number, opts: { rate?: number; note?: string } = {}): number | null {
  const a = get<{ supplier_id: number; qty_mt: number; status: string; booking_id: number | null; requirement_id: number; product_id: number }>(
    `SELECT a.supplier_id, a.qty_mt, a.status, a.booking_id, a.requirement_id, r.product_id
     FROM allocations a JOIN requirements r ON r.id = a.requirement_id WHERE a.id = ?`, allocId);
  if (!a || a.status !== 'ENQUIRY' || a.booking_id) return null;
  const bookingId = bookLeg(a.supplier_id, a.product_id, a.qty_mt, opts.note ?? `From requirement ${a.requirement_id}`);
  if (opts.rate && opts.rate > 0) run(`UPDATE allocations SET booking_id = ?, status = 'PI_RECEIVED', rate_inr_kg = ? WHERE id = ?`, bookingId, Math.round(opts.rate * 100) / 100, allocId);
  else run(`UPDATE allocations SET booking_id = ?, status = 'PI_RECEIVED' WHERE id = ?`, bookingId, allocId);
  recompute(a.requirement_id);
  return bookingId;
}

/** Cancel a leg and its linked booking. Returns the requirement id. */
export function cancelAlloc(allocId: number): number | null {
  const a = get<{ booking_id: number | null; requirement_id: number }>(`SELECT booking_id, requirement_id FROM allocations WHERE id = ?`, allocId);
  if (!a) return null;
  run(`UPDATE allocations SET status = 'CANCELLED' WHERE id = ?`, allocId);
  if (a.booking_id) run(`UPDATE bookings SET status = 'CANCELLED', notes = 'Allocation cancelled' WHERE id = ?`, a.booking_id);
  recompute(a.requirement_id);
  return a.requirement_id;
}
