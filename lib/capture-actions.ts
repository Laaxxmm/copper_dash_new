'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { get, run } from './db';
import { today } from './format';
import { matchAllocation, matchSupplier, matchCustomer, detectProductId, poByReference, parseDoc, type ParsedDoc } from './capture';
import { bookEnquiry, cancelAlloc } from './req-core';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const num = (fd: FormData, k: string) => Number(fd.get(k) ?? 0);
const refresh = () => revalidatePath('/', 'layout');

/** Paste a PI/PO email → parse, map to a supplier (domain/keyword/name) + product,
 *  also try an open enquiry, and stage for review. Never posts. */
export async function captureEmail(fd: FormData) {
  const rawText = str(fd, 'text');
  if (rawText.length < 15) redirect('/inbox?err=' + encodeURIComponent('Paste the PI or PO email text first.'));
  const parsed = parseDoc(rawText);
  const sup = matchSupplier(rawText);
  const productId = detectProductId(rawText);
  const alloc = matchAllocation(parsed, rawText);
  run(
    `INSERT INTO email_captures
       (received_at, doc_type, reference_no, matched_allocation_id, matched_requirement_id,
        matched_supplier_id, matched_product_id, extracted_json, status, raw_ref)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    today(), parsed.doc_type, parsed.reference_no, alloc?.allocation_id ?? null, alloc?.requirement_id ?? null,
    sup?.supplier_id ?? null, productId, JSON.stringify(parsed), parsed.mismatch ? 'MISMATCH' : 'PENDING', rawText);
  refresh();
  redirect('/inbox');
}

/** Human confirms a staged capture → auto-populate:
 *  CANCEL → cancel the referenced PO (or matched enquiry); PI/PO → log the supplier's
 *  agreed quantity for the month (or book the matched enquiry). */
export async function confirmCapture(fd: FormData) {
  const id = num(fd, 'capture_id');
  const c = get<{
    doc_type: string; status: string; reference_no: string | null; extracted_json: string;
    matched_allocation_id: number | null; matched_supplier_id: number | null; matched_product_id: number | null;
  }>(`SELECT doc_type, status, reference_no, extracted_json, matched_allocation_id, matched_supplier_id, matched_product_id
      FROM email_captures WHERE id = ?`, id);
  if (!c || (c.status !== 'PENDING' && c.status !== 'MISMATCH')) redirect('/inbox');

  if (c!.doc_type === 'CANCEL') {
    const po = poByReference(c!.reference_no);
    if (po) run(`UPDATE purchase_orders SET status = 'CANCELLED', cancelled_date = ? WHERE id = ?`, today(), po.id);
    else if (c!.matched_allocation_id) cancelAlloc(c!.matched_allocation_id);
    else redirect('/inbox?err=' + encodeURIComponent('No PO or enquiry found for that reference to cancel.'));
  } else if (c!.matched_allocation_id) {
    // An open enquiry leg was matched → book it at the PI rate (requirement flow).
    const parsed = JSON.parse(c!.extracted_json) as ParsedDoc;
    const rate = num(fd, 'rate') > 0 ? num(fd, 'rate') : parsed.computed_rate_inr_kg ?? undefined;
    bookEnquiry(c!.matched_allocation_id, { rate, note: `PI ${c!.reference_no ?? '—'}` });
  } else if (c!.matched_supplier_id && c!.matched_product_id) {
    // Supplier flow: log the agreed quantity for this month (auto-populate the KPI).
    const parsed = JSON.parse(c!.extracted_json) as ParsedDoc;
    const qty = num(fd, 'qty') > 0 ? num(fd, 'qty') : parsed.qty_mt ?? 0;
    const month = today().slice(0, 7);
    run(`INSERT INTO supplier_targets (supplier_id, product_id, month, target_mt, agreed_mt)
         VALUES (?,?,?,0,?)
         ON CONFLICT(supplier_id, product_id, month) DO UPDATE SET agreed_mt = agreed_mt + ?`,
      c!.matched_supplier_id, c!.matched_product_id, month, qty, qty);
  } else {
    redirect('/inbox?err=' + encodeURIComponent('No supplier or enquiry matched — set the supplier mail map in Settings, or reject.'));
  }
  run(`UPDATE email_captures SET status = 'CONFIRMED' WHERE id = ?`, id);
  refresh();
  redirect('/inbox');
}

export async function rejectCapture(fd: FormData) {
  run(`UPDATE email_captures SET status = 'REJECTED' WHERE id = ?`, num(fd, 'capture_id'));
  refresh();
  redirect('/inbox');
}

// ---------- customer side: capture a customer's PO ----------
export async function captureCustomerEmail(fd: FormData) {
  const rawText = str(fd, 'text');
  if (rawText.length < 15) redirect('/sales/inbox?err=' + encodeURIComponent('Paste the customer PO email text first.'));
  const parsed = parseDoc(rawText);
  const cust = matchCustomer(rawText);
  run(
    `INSERT INTO email_captures (received_at, doc_type, reference_no, matched_customer_id, extracted_json, status, raw_ref)
     VALUES (?,?,?,?,?,?,?)`,
    today(), parsed.doc_type, parsed.reference_no, cust?.supplier_id ?? null, JSON.stringify(parsed),
    parsed.mismatch ? 'MISMATCH' : 'PENDING', rawText);
  refresh();
  redirect('/sales/inbox');
}

/** Confirm a customer PO → record it against their latest open PI (or cancel on a CANCEL doc). */
export async function confirmCustomerCapture(fd: FormData) {
  const id = num(fd, 'capture_id');
  const c = get<{ doc_type: string; status: string; reference_no: string | null; matched_customer_id: number | null }>(
    `SELECT doc_type, status, reference_no, matched_customer_id FROM email_captures WHERE id = ?`, id);
  if (!c || (c.status !== 'PENDING' && c.status !== 'MISMATCH')) redirect('/sales/inbox');
  if (!c!.matched_customer_id) redirect('/sales/inbox?err=' + encodeURIComponent('No customer matched — set the mail map in Settings, or reject.'));

  if (c!.doc_type === 'CANCEL') {
    const pi = get<{ id: number; booking_id: number | null }>(
      `SELECT id, booking_id FROM sales_pi WHERE customer_id = ? AND status = 'SENT' ORDER BY id DESC LIMIT 1`, c!.matched_customer_id);
    if (pi) {
      run(`UPDATE sales_pi SET status = 'CANCELLED', cancelled_date = ? WHERE id = ?`, today(), pi.id);
      if (pi.booking_id) run(`UPDATE bookings SET status = 'CANCELLED', notes = 'Customer cancelled' WHERE id = ?`, pi.booking_id);
    }
  } else {
    const pi = get<{ id: number }>(
      `SELECT id FROM sales_pi WHERE customer_id = ? AND status = 'SENT' AND customer_po IS NULL ORDER BY id DESC LIMIT 1`, c!.matched_customer_id);
    if (pi) run(`UPDATE sales_pi SET customer_po = ? WHERE id = ?`, c!.reference_no ?? 'received', pi.id);
  }
  run(`UPDATE email_captures SET status = 'CONFIRMED' WHERE id = ?`, id);
  refresh();
  redirect('/sales/inbox');
}

/** Pull unseen PI/PO from the configured Gmail mailbox into the review queue. */
export async function checkMailNow() {
  const { pollMailbox } = await import('./mailbox');
  const r = await pollMailbox();
  refresh();
  redirect('/inbox?msg=' + encodeURIComponent(r.message));
}
