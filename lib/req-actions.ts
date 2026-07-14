'use server';

import { withTenant } from '@/lib/tenant-resolve';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { get, run } from './db';
import { supplierBoard } from './pricing';
import { today } from './format';
import { bookEnquiry, bookLeg, cancelAlloc, engineRate, recompute, supplierTerms } from './req-core';

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

async function _addRequirement(fd: FormData) {
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

/** Validate a leg against its requirement; returns the requirement + rate + tier or redirects on error. */
function checkLeg(fd: FormData) {
  const reqId = num(fd, 'requirement_id');
  const supplierId = num(fd, 'supplier_id');
  const qty = num(fd, 'qty');
  const back = `/requirements/${reqId}`;
  const req = get<{ product_id: number; qty_mt: number; status: string }>(`SELECT product_id, qty_mt, status FROM requirements WHERE id = ?`, reqId);
  if (!req) fail('/requirements', 'Requirement not found.');
  if (req.status === 'CANCELLED') fail(back, 'This requirement is cancelled.');
  if (get<{ type: string }>(`SELECT type FROM parties WHERE id = ?`, supplierId)?.type !== 'SUPPLIER') fail(back, 'Pick a supplier for this leg.');
  if (!(qty > 0)) fail(back, 'Quantity must be more than 0 MT.');
  const sourced = get<{ s: number }>(`SELECT IFNULL(SUM(qty_mt),0) s FROM allocations WHERE requirement_id = ? AND status != 'CANCELLED'`, reqId)!.s;
  if (qty > req.qty_mt - sourced + 0.001) fail(back, `Only ${Math.round((req.qty_mt - sourced) * 100) / 100} MT is still to be sourced.`);
  const st = supplierTerms(supplierId, req.product_id);
  const rate = num(fd, 'rate') > 0 ? num(fd, 'rate') : engineRate(supplierId, st);
  const tier = supplierBoard(req.product_id).rows.find((r) => r.supplier_id === supplierId)?.tier ?? null;
  return { reqId, supplierId, qty, back, req, rate: Math.round(rate * 100) / 100, tier };
}

/** Send an ordering slip: record an ENQUIRY leg (no booking yet). The email itself
 *  goes out via a mailto link on the requirement page — no SMTP, uses the client's mail app. */
async function _sendEnquiry(fd: FormData) {
  const { reqId, supplierId, qty, back, rate, tier } = checkLeg(fd);
  run(
    `INSERT INTO allocations (requirement_id, supplier_id, tier_label, qty_mt, rate_inr_kg, booking_id, status, created_date, sent_at, notes)
     VALUES (?,?,?,?,?, NULL, 'ENQUIRY', ?, ?, NULL)`,
    reqId, supplierId, tier, qty, rate, today(), today());
  recompute(reqId);
  refresh();
  redirect(back);
}

/** Confirm a supplier's PI: turn an ENQUIRY leg into a booked leg. */
async function _confirmEnquiry(fd: FormData) {
  const allocId = num(fd, 'allocation_id');
  const reqId = num(fd, 'requirement_id');
  if (bookEnquiry(allocId) == null) fail(`/requirements/${reqId}`, 'This leg is not an open enquiry.');
  refresh();
  redirect(`/requirements/${reqId}`);
}

/** Directly commit a leg (skip the enquiry step) — used by tests/quick entry. */
async function _addAllocation(fd: FormData) {
  const { reqId, supplierId, qty, back, req, rate, tier } = checkLeg(fd);
  const bookingId = bookLeg(supplierId, req.product_id, qty, `From ${str(fd, 'req_no') || 'requirement'}`);
  run(
    `INSERT INTO allocations (requirement_id, supplier_id, tier_label, qty_mt, rate_inr_kg, booking_id, status, created_date, notes)
     VALUES (?,?,?,?,?,?, 'PI_RECEIVED', ?, NULL)`,
    reqId, supplierId, tier, qty, rate, bookingId, today());
  recompute(reqId);
  refresh();
  redirect(back);
}

async function _cancelAllocation(fd: FormData) {
  const reqId = num(fd, 'requirement_id');
  if (cancelAlloc(num(fd, 'allocation_id')) == null) fail(`/requirements/${reqId}`, 'Allocation not found.');
  refresh();
  redirect(`/requirements/${reqId}`);
}

async function _cancelRequirement(fd: FormData) {
  const reqId = num(fd, 'requirement_id');
  run(`UPDATE requirements SET status = 'CANCELLED' WHERE id = ?`, reqId);
  refresh();
  redirect(`/requirements/${reqId}`);
}

export const addRequirement = withTenant(_addRequirement);
export const sendEnquiry = withTenant(_sendEnquiry);
export const confirmEnquiry = withTenant(_confirmEnquiry);
export const addAllocation = withTenant(_addAllocation);
export const cancelAllocation = withTenant(_cancelAllocation);
export const cancelRequirement = withTenant(_cancelRequirement);
