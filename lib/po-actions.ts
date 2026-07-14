'use server';

// Create / cancel purchase orders. The PO's provisional rate is computed from
// the live LME + the supplier's remembered terms; the gross becomes the
// committed cost of purchase (Phase A's costOfPurchase reads purchase_orders).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { get, run } from './db';
import { today } from './format';
import { composePO, isInterState } from './po';
import { companyProfile } from './company';
import { latestLme, fxRate } from './pricing';
import { westmetallLme } from './market';

export async function createPO(fd: FormData) {
  const sid = Number(fd.get('supplier_id'));
  const pid = Number(fd.get('product_id'));
  const qty = Number(fd.get('qty_mt'));
  if (!sid || !pid || !(qty > 0)) redirect('/po/new');

  const supplier = get<{ name: string; gstin: string | null; exchange_basis: string }>(
    `SELECT name, gstin, IFNULL(exchange_basis, 'RBI_TT') exchange_basis FROM parties WHERE id = ? AND type = 'SUPPLIER'`, sid);
  if (!supplier) redirect('/po/new');
  const term = get<{ premium_usd_mt: number; transaction_usd_mt: number; factor_pct: number; handling_inr_mt: number; basis: string }>(
    `SELECT premium_usd_mt, transaction_usd_mt, factor_pct, handling_inr_mt, IFNULL(default_basis, 'DAY') basis
     FROM supplier_terms WHERE supplier_id = ? AND product_id = ?`, sid, pid)
    ?? { premium_usd_mt: 0, transaction_usd_mt: 0, factor_pct: 0, handling_inr_mt: 0, basis: 'DAY' };

  const company = companyProfile();
  const live = (await westmetallLme())?.usd_mt ?? latestLme()?.usd_mt ?? 0;
  const fx = fxRate(supplier!.exchange_basis);
  const comp = composePO({
    lme_usd_mt: live, premium_usd_mt: term.premium_usd_mt, transaction_usd_mt: term.transaction_usd_mt,
    factor_pct: term.factor_pct, exchange_rate: fx, handling_inr_mt: term.handling_inr_mt,
    qty_mt: qty, gstPct: 18, interState: isInterState(company.gstin, supplier!.gstin),
  });

  const seq = (get<{ c: number }>(`SELECT COUNT(*) c FROM purchase_orders`)?.c ?? 0) + 1;
  const poNo = `PO-${String(seq).padStart(3, '0')}`;
  const id = Number(run(
    `INSERT INTO purchase_orders (po_no, supplier_id, product_id, month, qty_mt, rate_inr_kg,
       base_amount, tax_amount, gross_amount, lme_usd, fx_rate, basis, status, created_date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'SENT', ?)`,
    poNo, sid, pid, today().slice(0, 7), qty, comp.rate_inr_kg, comp.base, comp.tax, comp.gross,
    live, fx, term.basis, today()).lastInsertRowid);

  revalidatePath('/', 'layout');
  redirect(`/po/${id}`);
}

export async function cancelPO(fd: FormData) {
  const id = Number(fd.get('po_id'));
  if (!id) redirect('/');
  run(`UPDATE purchase_orders SET status = 'CANCELLED', cancelled_date = ? WHERE id = ? AND status = 'SENT'`, today(), id);
  revalidatePath('/', 'layout');
  redirect(`/po/${id}`);
}
