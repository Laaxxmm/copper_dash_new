'use server';

import { withTenant } from '@/lib/tenant-resolve';
// Data entry: every form on /add posts to one of these actions.
// Each action validates, writes, revalidates all pages, then sends the
// user to the page where the new entry is visible.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { all, get, run } from './db';
import { today } from './format';

function fail(what: string, msg: string): never {
  redirect(`/add?what=${what}&err=${encodeURIComponent(msg)}`);
}

function refresh() {
  revalidatePath('/', 'layout');
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const num = (fd: FormData, k: string) => Number(fd.get(k) ?? 0);

function nextNo(prefix: 'PB' | 'SB' | 'CB'): string {
  if (prefix === 'CB') {
    const r = get<{ n: number }>(
      `SELECT COUNT(*) n FROM invoices WHERE invoice_no LIKE 'CB/%'`)!;
    return `CB/26-27/${String(r.n + 1).padStart(4, '0')}`;
  }
  const r = get<{ n: number }>(`SELECT COUNT(*) n FROM bookings WHERE booking_no LIKE '${prefix}-%'`)!;
  return `${prefix}-${String(r.n + 1).padStart(3, '0')}`;
}

// ---------- new customer / supplier ----------
async function _addParty(fd: FormData) {
  const type = str(fd, 'type') === 'SUPPLIER' ? 'SUPPLIER' : str(fd, 'type') === 'CUSTOMER' ? 'CUSTOMER' : null;
  const name = str(fd, 'name');
  const city = str(fd, 'city') || null;
  const contact = str(fd, 'contact') || null;
  const phone = str(fd, 'phone') || null;
  const gstin = str(fd, 'gstin').toUpperCase() || null;
  const email = str(fd, 'email') || null;
  const creditDays = num(fd, 'credit_days');
  const notes = str(fd, 'notes') || null;

  if (!type) fail('party', 'Pick whether this is a supplier or a customer.');
  if (name.length < 2) fail('party', 'Enter the firm name.');
  if (creditDays < 0 || creditDays > 365) fail('party', 'Credit days should be between 0 (advance) and 365.');
  if (gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) fail('party', 'That GSTIN does not look right — it is 15 characters (e.g. 24AAACH1201R1Z5).');
  const dup = get<{ id: number }>(`SELECT id FROM parties WHERE LOWER(name) = LOWER(?)`, name);
  if (dup) fail('party', `"${name}" is already in the list — open People to see them.`);

  run(`INSERT INTO parties (name, type, city, contact_person, phone, gstin, email, credit_days, notes)
       VALUES (?,?,?,?,?,?,?,?,?)`, name, type, city, contact, phone, gstin, email, creditDays, notes);
  refresh();
  redirect('/parties');
}

// ---------- daily price ----------
async function _saveCsp(fd: FormData) {
  const date = str(fd, 'date') || today();
  const price = num(fd, 'price');
  if (price < 100000 || price > 5000000) fail('price', 'Price looks wrong — enter ₹ per MT (e.g. 895000).');
  run(`INSERT INTO csp_prices (price_date, price_inr_mt) VALUES (?, ?)
       ON CONFLICT(price_date) DO UPDATE SET price_inr_mt = excluded.price_inr_mt`, date, price);
  refresh();
  redirect('/');
}

// ---------- LME base (manual-first; westmetall feed only pre-fills, never auto-writes) ----------
async function _saveLme(fd: FormData) {
  const date = str(fd, 'date') || today();
  const usd = num(fd, 'usd_mt');
  if (usd < 3000 || usd > 40000) fail('lme', 'LME looks wrong — enter US$ per tonne (e.g. 13250).');
  run(`INSERT INTO lme_prices (price_date, usd_mt, source) VALUES (?, ?, 'manual')
       ON CONFLICT(price_date) DO UPDATE SET usd_mt = excluded.usd_mt, source = 'manual'`, date, usd);
  refresh();
  redirect('/where-to-buy');
}

// ---------- supplier plan: manual L-rank + monthly target/agreed (per product) ----------
async function _saveSupplierPlan(fd: FormData) {
  const sid = num(fd, 'supplier_id');
  const pid = num(fd, 'product_id');
  const month = str(fd, 'month') || today().slice(0, 7);
  const clamp = (n: number) => Math.max(0, Math.min(100000, isFinite(n) ? n : 0));
  const rank = Math.round(num(fd, 'rank'));
  const target = clamp(num(fd, 'target_mt'));
  const agreed = clamp(num(fd, 'agreed_mt'));
  if (!sid || !pid) redirect('/suppliers');
  run(`UPDATE parties SET manual_rank = ? WHERE id = ?`, rank > 0 ? rank : null, sid);
  run(`INSERT INTO supplier_targets (supplier_id, product_id, month, target_mt, agreed_mt) VALUES (?,?,?,?,?)
       ON CONFLICT(supplier_id, product_id, month)
       DO UPDATE SET target_mt = excluded.target_mt, agreed_mt = excluded.agreed_mt`, sid, pid, month, target, agreed);
  refresh();
  redirect(`/suppliers?month=${month}&product=${pid}`);
}

// ---------- supplier payment terms (per product) + exchange basis (per supplier) ----------
async function _saveSupplierTerms(fd: FormData) {
  const sid = num(fd, 'supplier_id');
  const pid = num(fd, 'product_id');
  if (!sid || !pid) redirect('/suppliers');
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, isFinite(n) ? n : 0));
  const premium = clamp(num(fd, 'premium_usd_mt'), 0, 5000);
  const txn = clamp(num(fd, 'transaction_usd_mt'), 0, 5000);
  const factor = clamp(num(fd, 'factor_pct'), 0, 100);
  const handling = clamp(num(fd, 'handling_inr_mt'), 0, 100000);
  const basis = str(fd, 'basis') || 'DAY';
  const exchange = str(fd, 'exchange_basis') === 'SBI_TT' ? 'SBI_TT' : 'RBI_TT';
  run(`INSERT INTO supplier_terms (supplier_id, product_id, premium_usd_mt, transaction_usd_mt, factor_pct, handling_inr_mt, default_basis)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(supplier_id, product_id) DO UPDATE SET
         premium_usd_mt = excluded.premium_usd_mt, transaction_usd_mt = excluded.transaction_usd_mt,
         factor_pct = excluded.factor_pct, handling_inr_mt = excluded.handling_inr_mt, default_basis = excluded.default_basis`,
    sid, pid, premium, txn, factor, handling, basis);
  run(`UPDATE parties SET exchange_basis = ? WHERE id = ?`, exchange, sid);
  refresh();
  redirect(`/suppliers/${sid}`);
}

// ---------- booking ----------
async function _addBooking(fd: FormData) {
  const kind = str(fd, 'kind') === 'SALE' ? 'SALE' : 'PURCHASE';
  const partyId = num(fd, 'party_id');
  const qty = num(fd, 'qty');
  const basis = str(fd, 'basis');
  const premium = num(fd, 'premium');
  const date = str(fd, 'date') || today();
  const liftBy = str(fd, 'lift_by') || null;
  const linked = num(fd, 'linked_booking_id') || null;
  const notes = str(fd, 'notes') || null;

  const party = get<{ type: string }>(`SELECT type FROM parties WHERE id = ?`, partyId);
  if (!party) fail('booking', 'Pick the party.');
  if (kind === 'PURCHASE' && party.type !== 'SUPPLIER') fail('booking', 'A purchase booking must be with a supplier.');
  if (kind === 'SALE' && party.type !== 'CUSTOMER') fail('booking', 'A sale booking must be with a customer.');
  if (!(qty > 0)) fail('booking', 'Quantity must be more than 0 MT.');
  if (!['DAY_PRICE', 'WEEK_AVG', 'FORTNIGHT_AVG', 'MONTH_AVG', 'FIXED', 'PRICE_LATER'].includes(basis)) fail('booking', 'Pick how the price will be decided.');

  let avgStart: string | null = null, avgEnd: string | null = null;
  if (basis === 'MONTH_AVG') {
    const m = date.slice(0, 7);
    avgStart = `${m}-01`;
    avgEnd = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10);
  } else if (basis === 'FORTNIGHT_AVG') {
    const m = date.slice(0, 7);
    const dd = +date.slice(8, 10);
    avgStart = dd <= 15 ? `${m}-01` : `${m}-16`;
    avgEnd = dd <= 15 ? `${m}-15` : new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10);
  } else if (basis === 'WEEK_AVG') {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 6);
    avgStart = d.toISOString().slice(0, 10);
    avgEnd = date;
  }

  run(`INSERT INTO bookings (booking_no, kind, party_id, booking_date, qty_mt, pricing_basis,
        premium_inr_mt, avg_start, avg_end, lift_by_date, status, linked_booking_id, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?, 'OPEN', ?, ?)`,
    nextNo(kind === 'PURCHASE' ? 'PB' : 'SB'), kind, partyId, date, qty, basis, premium,
    avgStart, avgEnd, liftBy, linked, notes);
  refresh();
  redirect(`/bookings?kind=${kind}&status=OPEN`);
}

/** A booking finishes itself once every MT is both priced and moved. */
function maybeComplete(bookingId: number) {
  run(`UPDATE bookings SET status = 'COMPLETED'
       WHERE id = ? AND status = 'OPEN'
         AND qty_mt <= IFNULL((SELECT SUM(qty_mt) FROM price_fixations WHERE booking_id = bookings.id), 0) + 0.001
         AND qty_mt <= IFNULL((SELECT SUM(qty_mt) FROM liftings WHERE booking_id = bookings.id), 0) + 0.001`,
    bookingId);
}

// ---------- price fixation ----------
async function _addFixation(fd: FormData) {
  const bookingId = num(fd, 'booking_id');
  const qty = num(fd, 'qty');
  const rate = num(fd, 'rate');
  const date = str(fd, 'date') || today();

  const b = get<{ qty_mt: number; fixed: number; status: string }>(
    `SELECT b.qty_mt, IFNULL((SELECT SUM(qty_mt) FROM price_fixations WHERE booking_id = b.id), 0) fixed, b.status
     FROM bookings b WHERE b.id = ?`, bookingId);
  if (!b) fail('price-fix', 'Pick the booking.');
  if (b.status !== 'OPEN') fail('price-fix', 'That booking is not running any more.');
  const open = +(b.qty_mt - b.fixed).toFixed(2);
  if (!(qty > 0) || qty > open + 0.001) fail('price-fix', `Only ${open} MT of this booking is still unpriced.`);
  if (rate < 100000 || rate > 5000000) fail('price-fix', 'Rate looks wrong — enter ₹ per MT (e.g. 905000).');

  run(`INSERT INTO price_fixations (booking_id, fixation_date, qty_mt, price_inr_mt, reference, note)
       VALUES (?,?,?,?, 'NEGOTIATED', NULL)`, bookingId, date, qty, rate);
  maybeComplete(bookingId);
  refresh();
  redirect('/bookings?status=OPEN');
}

// ---------- truck dispatch (creates the bill automatically) ----------
async function _addLifting(fd: FormData) {
  const bookingId = num(fd, 'booking_id');
  const qty = num(fd, 'qty');
  const date = str(fd, 'date') || today();
  const truckNo = str(fd, 'truck_no');
  const transporter = str(fd, 'transporter') || null;
  const eway = str(fd, 'eway') || null;
  const challan = str(fd, 'challan') || null;
  const weight = num(fd, 'weight') || qty * 1000;
  const billNo = str(fd, 'bill_no');

  const b = get<{
    id: number; booking_no: string; kind: string; party_id: number; premium: number;
    qty_mt: number; lifted: number; credit_days: number; avg_rate: number | null; status: string;
  }>(
    `SELECT b.id, b.booking_no, b.kind, b.party_id, b.premium_inr_mt premium, b.qty_mt, b.status,
            IFNULL((SELECT SUM(qty_mt) FROM liftings WHERE booking_id = b.id), 0) lifted,
            p.credit_days,
            (SELECT SUM(qty_mt * price_inr_mt) / SUM(qty_mt) FROM price_fixations WHERE booking_id = b.id) avg_rate
     FROM bookings b JOIN parties p ON p.id = b.party_id WHERE b.id = ?`, bookingId);
  if (!b) fail('truck', 'Pick the booking this truck belongs to.');
  if (b.status !== 'OPEN') fail('truck', 'That booking is not running any more.');
  const open = +(b.qty_mt - b.lifted).toFixed(2);
  if (!(qty > 0) || qty > open + 0.001) fail('truck', `Only ${open} MT of this booking is still to be moved.`);
  if (!truckNo) fail('truck', 'Enter the truck number.');

  const lift = run(
    `INSERT INTO liftings (booking_id, dispatch_date, qty_mt, truck_no, transporter, driver_phone,
       eway_bill_no, challan_no, dispatch_weight_kg, status)
     VALUES (?,?,?,?,?, NULL, ?,?,?, 'IN_TRANSIT')`,
    bookingId, date, qty, truckNo.toUpperCase(), transporter, eway, challan, weight);

  // Bill rides with the truck: rate = fixed rate if priced, else today's price + premium (provisional).
  const csp = get<{ p: number }>(`SELECT price_inr_mt p FROM csp_prices ORDER BY price_date DESC LIMIT 1`)!.p;
  const rate = Math.round(b.avg_rate ?? (csp + b.premium));
  const base = Math.round(qty * rate);
  const gst = Math.round(base * 0.18);
  const due = new Date(date + 'T00:00:00Z');
  due.setUTCDate(due.getUTCDate() + b.credit_days);
  run(`INSERT INTO invoices (invoice_no, kind, party_id, booking_id, lifting_id, invoice_date,
        qty_mt, rate_inr_mt, base_amount, gst_amount, total_amount, due_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    billNo || (b.kind === 'SALE' ? nextNo('CB') : `${b.booking_no}/BILL-${b.lifted + qty}`),
    b.kind, b.party_id, bookingId, Number(lift.lastInsertRowid), date,
    qty, rate, base, gst, base + gst, due.toISOString().slice(0, 10));
  maybeComplete(bookingId);
  refresh();
  redirect('/trucks?status=IN_TRANSIT');
}

// ---------- truck arrival / unloading ----------
async function _updateTruck(fd: FormData) {
  const liftingId = num(fd, 'lifting_id');
  const event = str(fd, 'event'); // ARRIVED | UNLOADED
  const date = str(fd, 'date') || today();
  const receivedKg = num(fd, 'received_kg') || null;
  const unloadedBy = str(fd, 'unloaded_by') || null;

  const l = get<{ status: string; dispatch_weight_kg: number }>(
    `SELECT status, dispatch_weight_kg FROM liftings WHERE id = ?`, liftingId);
  if (!l) fail('truck-update', 'Pick the truck.');
  if (l.status === 'UNLOADED') fail('truck-update', 'That truck is already unloaded.');

  if (event === 'ARRIVED') {
    run(`UPDATE liftings SET status='ARRIVED', arrived_date=? WHERE id=?`, date, liftingId);
  } else if (event === 'UNLOADED') {
    if (receivedKg && receivedKg > l.dispatch_weight_kg * 1.02) {
      fail('truck-update', `Received weight (${receivedKg} kg) is more than what was sent (${l.dispatch_weight_kg} kg) — check the slip.`);
    }
    run(`UPDATE liftings SET status='UNLOADED',
           arrived_date=IFNULL(arrived_date, ?), unloaded_date=?, unloaded_by=?, received_weight_kg=?
         WHERE id=?`, date, date, unloadedBy, receivedKg, liftingId);
  } else {
    fail('truck-update', 'Pick what happened — arrived or unloaded.');
  }
  refresh();
  redirect('/trucks');
}

// ---------- payment ----------
async function _addPayment(fd: FormData) {
  const invoiceId = num(fd, 'invoice_id');
  const amount = num(fd, 'amount');
  const date = str(fd, 'date') || today();
  const mode = str(fd, 'mode');
  const utrNo = str(fd, 'utr') || null;
  const bank = str(fd, 'bank') || null;

  const inv = get<{ party_id: number; kind: string; total_amount: number; paid: number }>(
    `SELECT i.party_id, i.kind, i.total_amount,
            IFNULL((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0) paid
     FROM invoices i WHERE i.id = ?`, invoiceId);
  if (!inv) fail('payment', 'Pick the bill this payment is against.');
  const pending = +(inv.total_amount - inv.paid).toFixed(2);
  if (!(amount > 0)) fail('payment', 'Enter the amount received or paid.');
  if (amount > pending + 1) fail('payment', `Only ₹${pending.toLocaleString('en-IN')} is pending on this bill.`);
  if (!['RTGS', 'NEFT', 'IMPS', 'UPI', 'CHEQUE', 'CASH'].includes(mode)) fail('payment', 'Pick how it was paid.');
  if (['RTGS', 'NEFT', 'IMPS'].includes(mode) && !utrNo) fail('payment', `Enter the ${mode} reference (UTR) — it settles every dispute later.`);

  run(`INSERT INTO payments (direction, party_id, invoice_id, payment_date, amount, mode, utr_no, bank, note)
       VALUES (?,?,?,?,?,?,?,?, NULL)`,
    inv.kind === 'SALE' ? 'IN' : 'OUT', inv.party_id, invoiceId, date, amount, mode, utrNo, bank);
  refresh();
  redirect('/money');
}

export const addParty = withTenant(_addParty);
export const saveCsp = withTenant(_saveCsp);
export const saveLme = withTenant(_saveLme);
export const saveSupplierPlan = withTenant(_saveSupplierPlan);
export const saveSupplierTerms = withTenant(_saveSupplierTerms);
export const addBooking = withTenant(_addBooking);
export const addFixation = withTenant(_addFixation);
export const addLifting = withTenant(_addLifting);
export const updateTruck = withTenant(_updateTruck);
export const addPayment = withTenant(_addPayment);
