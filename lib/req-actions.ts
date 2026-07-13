'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { get, run } from './db';
import { ratePerKg } from './formula';
import { fxRate, latestLme, supplierBoard } from './pricing';
import { today } from './format';

function fail(where: string, msg: string): never {
  redirect(`${where}?err=${encodeURIComponent(msg)}`);
}
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const num = (fd: FormData, k: string) => Number(fd.get(k) ?? 0);
const refresh = () => revalidatePath('/', 'layout');

function reqNo(): string {
  const ym = today().slice(0, 7).replace('-', '');
  const n = get<{ c: number }>(`SELECT COUNT(*) c FROM requirements WHERE req_no LIKE ?`, `REQ-${ym}-%`)!.c;
  return `REQ-${ym}-${String(n + 1).padStart(3, '0')}`;
}
function nextPb(): string {
  const n = get<{ c: number }>(`SELECT COUNT(*) c FROM bookings WHERE booking_no LIKE 'PB-%'`)!.c;
  return `PB-${String(n + 1).padStart(3, '0')}`;
}

/** Recompute OPEN/PARTIAL/FILLED from live allocations (leaves a CANCELLED requirement alone). */
function recompute(reqId: number) {
  const r = get<{ qty_mt: number; status: string; sourced: number }>(
    `SELECT qty_mt, status,
            IFNULL((SELECT SUM(qty_mt) FROM allocations WHERE requirement_id = ? AND status != 'CANCELLED'), 0) sourced
     FROM requirements WHERE id = ?`, reqId, reqId);
  if (!r || r.status === 'CANCELLED') return;
  const status = r.sourced >= r.qty_mt - 0.001 ? 'FILLED' : r.sourced > 0 ? 'PARTIAL' : 'OPEN';
  run(`UPDATE requirements SET status = ? WHERE id = ?`, status, reqId);
}

export async function addRequirement(fd: FormData) {
  const productId = num(fd, 'product_id');
  const qty = num(fd, 'qty');
  const customerId = num(fd, 'customer_id') || null;
  const needBy = str(fd, 'need_by') || null;
  const targetSell = num(fd, 'target_sell') || null;
  const notes = str(fd, 'notes') || null;

  if (!get(`SELECT 1 FROM products WHERE id = ?`, productId)) fail('/requirements/new', 'Pick the product.');
  if (!(qty > 0)) fail('/requirements/new', 'Quantity must be more than 0 MT.');
  if (customerId && get<{ type: string }>(`SELECT type FROM parties WHERE id = ?`, customerId)?.type !== 'CUSTOMER')
    fail('/requirements/new', 'That party is not a customer.');

  const id = Number(run(
    `INSERT INTO requirements (req_no, customer_id, product_id, qty_mt, need_by_date, target_sell_inr_kg, status, created_date, notes)
     VALUES (?,?,?,?,?,?, 'OPEN', ?, ?)`,
    reqNo(), customerId, productId, qty, needBy, targetSell, today(), notes).lastInsertRowid);
  refresh();
  redirect(`/requirements/${id}`);
}

/** Add a supplier leg. This also creates the linked purchase booking (the leg
 *  enters the existing trade lifecycle). Rate defaults to today's engine rate. */
export async function addAllocation(fd: FormData) {
  const reqId = num(fd, 'requirement_id');
  const supplierId = num(fd, 'supplier_id');
  const qty = num(fd, 'qty');
  let rate = num(fd, 'rate');
  const back = `/requirements/${reqId}`;

  const req = get<{ product_id: number; qty_mt: number; status: string }>(
    `SELECT product_id, qty_mt, status FROM requirements WHERE id = ?`, reqId);
  if (!req) fail('/requirements', 'Requirement not found.');
  if (req.status === 'CANCELLED') fail(back, 'This requirement is cancelled.');
  if (get<{ type: string }>(`SELECT type FROM parties WHERE id = ?`, supplierId)?.type !== 'SUPPLIER')
    fail(back, 'Pick a supplier for this leg.');
  if (!(qty > 0)) fail(back, 'Quantity must be more than 0 MT.');
  const sourced = get<{ s: number }>(`SELECT IFNULL(SUM(qty_mt),0) s FROM allocations WHERE requirement_id = ? AND status != 'CANCELLED'`, reqId)!.s;
  if (qty > req.qty_mt - sourced + 0.001) fail(back, `Only ${Math.round((req.qty_mt - sourced) * 100) / 100} MT is still to be sourced.`);

  const st = get<{ premium_usd_mt: number; transaction_usd_mt: number; factor_pct: number; handling_inr_mt: number }>(
    `SELECT premium_usd_mt, transaction_usd_mt, factor_pct, handling_inr_mt FROM supplier_terms WHERE supplier_id = ? AND product_id = ?`,
    supplierId, req.product_id) ?? { premium_usd_mt: 0, transaction_usd_mt: 0, factor_pct: 0, handling_inr_mt: 0 };

  if (!(rate > 0)) {
    const lme = latestLme()?.usd_mt ?? 0;
    const basis = get<{ b: string }>(`SELECT exchange_basis b FROM parties WHERE id = ?`, supplierId)?.b ?? 'RBI_TT';
    rate = ratePerKg({ lme_usd_mt: lme, exchange_rate: fxRate(basis), ...st });
  }

  // Snapshot the supplier's L-tier at allocation time.
  const tier = supplierBoard(req.product_id).rows.find((r) => r.supplier_id === supplierId)?.tier ?? null;

  // The supplier leg becomes a provisional purchase booking (price fixed later).
  const bookingId = Number(run(
    `INSERT INTO bookings (booking_no, kind, party_id, booking_date, qty_mt, pricing_basis, premium_inr_mt,
       avg_start, avg_end, lift_by_date, status, linked_booking_id, notes,
       premium_usd_mt, transaction_usd_mt, factor_pct, handling_inr_mt, product_id)
     VALUES (?, 'PURCHASE', ?, ?, ?, 'PRICE_LATER', 0, NULL, NULL, NULL, 'OPEN', NULL, ?, ?, ?, ?, ?, ?)`,
    nextPb(), supplierId, today(), qty, `From ${str(fd, 'req_no') || 'requirement'}`,
    st.premium_usd_mt, st.transaction_usd_mt, st.factor_pct, st.handling_inr_mt, req.product_id).lastInsertRowid);

  run(
    `INSERT INTO allocations (requirement_id, supplier_id, tier_label, qty_mt, rate_inr_kg, booking_id, status, created_date, notes)
     VALUES (?,?,?,?,?,?, 'PI_RECEIVED', ?, NULL)`,
    reqId, supplierId, tier, qty, Math.round(rate * 100) / 100, bookingId, today());
  recompute(reqId);
  refresh();
  redirect(back);
}

export async function cancelAllocation(fd: FormData) {
  const allocId = num(fd, 'allocation_id');
  const reqId = num(fd, 'requirement_id');
  const a = get<{ booking_id: number | null }>(`SELECT booking_id FROM allocations WHERE id = ?`, allocId);
  if (!a) fail(`/requirements/${reqId}`, 'Allocation not found.');
  run(`UPDATE allocations SET status = 'CANCELLED' WHERE id = ?`, allocId);
  if (a.booking_id) run(`UPDATE bookings SET status = 'CANCELLED', notes = 'Allocation cancelled' WHERE id = ?`, a.booking_id);
  recompute(reqId);
  refresh();
  redirect(`/requirements/${reqId}`);
}

export async function cancelRequirement(fd: FormData) {
  const reqId = num(fd, 'requirement_id');
  run(`UPDATE requirements SET status = 'CANCELLED' WHERE id = ?`, reqId);
  refresh();
  redirect(`/requirements/${reqId}`);
}
