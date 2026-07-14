'use server';

// Issue a customer PI: computes the selling ₹/kg from the product's template
// (buy cost from the linked purchase lot + fabrication), creates a SALE booking
// linked to that purchase (so margin + basis-mismatch fall out later), prices it,
// and records the PI document. Cancel reverses it.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { get, run } from './db';
import { today } from './format';
import { amountInr, gstAmount } from './formula';
import { isInterState } from './po';
import { companyProfile } from './company';
import { evalFormula } from './sale-formula';
import { templateWithLines } from './sale-pricing';
import { supplierBoard } from './pricing';

const num = (fd: FormData, k: string) => Number(fd.get(k) ?? 0);
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

export async function createSalePI(fd: FormData) {
  const customer = num(fd, 'customer_id');
  const spId = num(fd, 'sale_product_id');
  const qty = num(fd, 'qty_mt');
  const sourceId = num(fd, 'source_booking_id');
  const sellBasis = str(fd, 'sell_basis') || 'DAY_PRICE';
  if (!customer || !(qty > 0)) redirect('/sales/pi/new?err=' + encodeURIComponent('Pick a customer and quantity.'));

  const sp = spId ? get<{ raw_product_id: number | null; template_id: number | null; fabrication_cost: number; name: string }>(
    `SELECT raw_product_id, template_id, fabrication_cost, name FROM sale_products WHERE id = ?`, spId) : null;

  // Buy cost from the source purchase lot (its fixed rate), else the cheapest supplier rate.
  const src = sourceId ? get<{ product_id: number | null; buy_rate_mt: number | null }>(
    `SELECT b.product_id, (SELECT SUM(qty_mt * price_inr_mt) / SUM(qty_mt) FROM price_fixations WHERE booking_id = b.id) buy_rate_mt
     FROM bookings b WHERE b.id = ? AND b.kind = 'PURCHASE'`, sourceId) : null;
  const rawId = sp?.raw_product_id ?? src?.product_id ?? null;
  let buyKg = src?.buy_rate_mt ? src.buy_rate_mt / 1000 : 0;
  if (!buyKg && rawId) { const rows = supplierBoard(rawId).rows; buyKg = rows.length ? rows[0].rate_inr_kg : 0; }

  const lines = sp?.template_id ? (templateWithLines(sp.template_id)?.lines ?? []) : [];
  const sellRate = lines.length
    ? evalFormula(lines, { buy_cost: buyKg, fabrication: sp?.fabrication_cost ?? 0 }).price
    : (num(fd, 'manual_rate') || buyKg);
  if (!(sellRate > 0)) redirect('/sales/pi/new?err=' + encodeURIComponent('Could not compute a selling price — attach a template or enter a rate.'));

  const cust = get<{ gstin: string | null }>(`SELECT gstin FROM parties WHERE id = ?`, customer);
  const inter = isInterState(companyProfile().gstin, cust?.gstin ?? null);
  const qtyKg = Math.round(qty * 1000 * 1000) / 1000;
  const base = amountInr(sellRate, qtyKg);
  const tax = gstAmount(base, 18);
  const gross = Math.round((base + tax) * 100) / 100;

  // SALE booking linked to the source purchase, priced at the sell rate.
  const sbSeq = (get<{ c: number }>(`SELECT COUNT(*) c FROM bookings WHERE kind = 'SALE'`)?.c ?? 0) + 1;
  const bno = `SB-${String(sbSeq).padStart(3, '0')}`;
  const bid = Number(run(
    `INSERT INTO bookings (booking_no, kind, party_id, booking_date, qty_mt, pricing_basis, premium_inr_mt,
       avg_start, avg_end, lift_by_date, status, linked_booking_id, notes, product_id)
     VALUES (?,'SALE',?,?,?,?,0,NULL,NULL,NULL,'OPEN',?,?,?)`,
    bno, customer, today(), qty, sellBasis, sourceId || null, sp ? `PI for ${sp.name}` : 'Direct sale', rawId).lastInsertRowid);
  run(`INSERT INTO price_fixations (booking_id, fixation_date, qty_mt, price_inr_mt, reference, note) VALUES (?,?,?,?, 'NEGOTIATED', 'Customer PI')`,
    bid, today(), qty, Math.round(sellRate * 1000));

  const piSeq = (get<{ c: number }>(`SELECT COUNT(*) c FROM sales_pi`)?.c ?? 0) + 1;
  const piNo = `CPI-${String(piSeq).padStart(3, '0')}`;
  const id = Number(run(
    `INSERT INTO sales_pi (pi_no, customer_id, sale_product_id, booking_id, qty_mt, rate_inr_kg,
       base_amount, tax_amount, gross_amount, basis, status, created_date)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'SENT', ?)`,
    piNo, customer, spId || null, bid, qty, sellRate, base, tax, gross, sellBasis, today()).lastInsertRowid);
  void inter; // GST split derived at render time from state codes
  revalidatePath('/', 'layout');
  redirect(`/sales/pi/${id}`);
}

export async function cancelSalePI(fd: FormData) {
  const id = num(fd, 'pi_id');
  const pi = get<{ booking_id: number | null }>(`SELECT booking_id FROM sales_pi WHERE id = ? AND status = 'SENT'`, id);
  if (pi) {
    run(`UPDATE sales_pi SET status = 'CANCELLED', cancelled_date = ? WHERE id = ?`, today(), id);
    if (pi.booking_id) run(`UPDATE bookings SET status = 'CANCELLED', notes = 'PI cancelled' WHERE id = ?`, pi.booking_id);
  }
  revalidatePath('/', 'layout');
  redirect(`/sales/pi/${id}`);
}
