// All business queries. Every insight the dashboard shows is computed here,
// directly from the event tables — nothing is stored twice.
import { all, get } from './db';
import { today } from './format';

// ---------- shared SQL fragments (used across queries — keep in one place) ----------
/** Per-booking fixation aggregate: fixed qty + weighted avg rate. Alias it. */
const FIX_AGG = `(SELECT booking_id, SUM(qty_mt) q, SUM(qty_mt * price_inr_mt) / SUM(qty_mt) rate
                  FROM price_fixations GROUP BY booking_id)`;
/** Per-booking lifted qty. */
const LIFT_AGG = `(SELECT booking_id, SUM(qty_mt) q FROM liftings GROUP BY booking_id)`;
/** Per-invoice paid amount. */
const PAID_AGG = `(SELECT invoice_id, SUM(amount) paid FROM payments GROUP BY invoice_id)`;
/** Matched back-to-back deals, both sides priced: sale s (customer cp) ↔ purchase pb (supplier sup). */
const MATCHED_DEALS = `
  FROM bookings s
  JOIN bookings pb ON pb.id = s.linked_booking_id
  JOIN parties cp ON cp.id = s.party_id
  JOIN parties sup ON sup.id = pb.party_id
  JOIN ${FIX_AGG} sf ON sf.booking_id = s.id
  JOIN ${FIX_AGG} pf ON pf.booking_id = pb.id
  WHERE s.kind = 'SALE'`;
/** Matched qty for a deal (can't earn on more than was priced). */
const DEAL_QTY = `MIN(IFNULL(sf.q, 0), s.qty_mt)`;
/** Outstanding amount for one party (correlated on p.id). */
const PARTY_OUTSTANDING = (extra = '') =>
  `IFNULL((SELECT SUM(i.total_amount - IFNULL(pp.paid, 0))
           FROM invoices i LEFT JOIN ${PAID_AGG} pp ON pp.invoice_id = i.id
           WHERE i.party_id = p.id AND i.total_amount - IFNULL(pp.paid, 0) > 1 ${extra}), 0)`;

// ---------- price ----------
export type CspPoint = { price_date: string; price_inr_mt: number };

export function cspSeries(days: number): CspPoint[] {
  return all<CspPoint>(
    `SELECT price_date, price_inr_mt FROM csp_prices ORDER BY price_date DESC LIMIT ?`, days).reverse();
}

export function cspToday(): { price: number; change: number; date: string } {
  const rows = cspSeries(2);
  const price = rows.at(-1)?.price_inr_mt ?? 0;
  const prev = rows.at(-2)?.price_inr_mt ?? price;
  return { price, change: price - prev, date: rows.at(-1)?.price_date ?? today() };
}

// ---------- bookings ----------
export type BookingRow = {
  id: number; booking_no: string; kind: 'PURCHASE' | 'SALE'; party_id: number; party_name: string;
  booking_date: string; qty_mt: number; pricing_basis: string; premium_inr_mt: number;
  avg_start: string | null; avg_end: string | null; lift_by_date: string | null;
  status: string; linked_booking_no: string | null;
  fixed_qty: number; avg_fixed_price: number | null;
  lifted_qty: number; billed_amount: number;
};

export function bookings(kind?: string, status?: string, partyId?: number): BookingRow[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (kind === 'PURCHASE' || kind === 'SALE') { where.push('b.kind = ?'); params.push(kind); }
  if (status === 'OPEN' || status === 'COMPLETED' || status === 'CANCELLED') { where.push('b.status = ?'); params.push(status); }
  if (partyId) { where.push('b.party_id = ?'); params.push(partyId); }
  return all<BookingRow>(
    `SELECT b.id, b.booking_no, b.kind, b.party_id, p.name AS party_name,
            b.booking_date, b.qty_mt, b.pricing_basis, b.premium_inr_mt,
            b.avg_start, b.avg_end, b.lift_by_date, b.status,
            lb.booking_no AS linked_booking_no,
            IFNULL(f.q, 0)  AS fixed_qty,
            f.rate          AS avg_fixed_price,
            IFNULL(l.q, 0)  AS lifted_qty,
            IFNULL(i.billed, 0) AS billed_amount
     FROM bookings b
     JOIN parties p ON p.id = b.party_id
     LEFT JOIN bookings lb ON lb.id = b.linked_booking_id
     LEFT JOIN ${FIX_AGG} f ON f.booking_id = b.id
     LEFT JOIN ${LIFT_AGG} l ON l.booking_id = b.id
     LEFT JOIN (SELECT booking_id, SUM(total_amount) billed FROM invoices GROUP BY booking_id) i ON i.booking_id = b.id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY b.booking_date DESC, b.id DESC`, ...params);
}

export function bookingsSummary() {
  const side = (kind: string) => get<{ open_qty: number; pending_lift: number }>(
    `SELECT IFNULL(SUM(b.qty_mt), 0) open_qty,
            IFNULL(SUM(b.qty_mt - IFNULL(l.q, 0)), 0) pending_lift
     FROM bookings b LEFT JOIN ${LIFT_AGG} l ON l.booking_id = b.id
     WHERE b.kind = ? AND b.status = 'OPEN'`, kind)!;
  const purchase = side('PURCHASE');
  const sale = side('SALE');
  return {
    openPurchaseQty: purchase.open_qty, pendingLiftPurchase: purchase.pending_lift,
    openSaleQty: sale.open_qty, pendingLiftSale: sale.pending_lift,
  };
}

/** Quantity booked but with no price fixed yet — the live price risk. */
export function unpricedExposure() {
  return all<{ kind: string; booking_no: string; party_name: string; qty_open: number; basis: string; booking_date: string }>(
    `SELECT b.kind, b.booking_no, p.name party_name, b.pricing_basis basis, b.booking_date,
            ROUND(b.qty_mt - IFNULL(f.q, 0), 2) qty_open
     FROM bookings b
     JOIN parties p ON p.id = b.party_id
     LEFT JOIN ${FIX_AGG} f ON f.booking_id = b.id
     WHERE b.status = 'OPEN' AND b.qty_mt - IFNULL(f.q, 0) > 0.05
     ORDER BY qty_open DESC`);
}

// ---------- trucks / liftings ----------
export type TruckRow = {
  id: number; booking_no: string; kind: string; party_name: string;
  dispatch_date: string; qty_mt: number; truck_no: string; transporter: string;
  eway_bill_no: string; challan_no: string;
  dispatch_weight_kg: number; received_weight_kg: number | null;
  arrived_date: string | null; unloaded_date: string | null; unloaded_by: string | null;
  status: string;
};

export function trucks(status?: string): TruckRow[] {
  const filtered = status && ['IN_TRANSIT', 'ARRIVED', 'UNLOADED'].includes(status);
  return all<TruckRow>(
    `SELECT l.id, b.booking_no, b.kind, p.name party_name, l.dispatch_date, l.qty_mt,
            l.truck_no, l.transporter, l.eway_bill_no, l.challan_no,
            l.dispatch_weight_kg, l.received_weight_kg, l.arrived_date, l.unloaded_date, l.unloaded_by, l.status
     FROM liftings l
     JOIN bookings b ON b.id = l.booking_id
     JOIN parties p ON p.id = b.party_id
     ${filtered ? 'WHERE l.status = ?' : ''}
     ORDER BY CASE l.status WHEN 'IN_TRANSIT' THEN 0 WHEN 'ARRIVED' THEN 1 ELSE 2 END, l.dispatch_date DESC`,
    ...(filtered ? [status!] : []));
}

export function truckSummary() {
  const rows = all<{ status: string; n: number; qty: number }>(
    `SELECT status, COUNT(*) n, IFNULL(SUM(qty_mt), 0) qty FROM liftings GROUP BY status`);
  const by = Object.fromEntries(rows.map((r) => [r.status, r]));
  return {
    inTransit: by.IN_TRANSIT ?? { n: 0, qty: 0 },
    arrived: by.ARRIVED ?? { n: 0, qty: 0 },
    shortages: get<{ n: number; kg: number }>(
      `SELECT COUNT(*) n, IFNULL(SUM(dispatch_weight_kg - received_weight_kg), 0) kg
       FROM liftings WHERE received_weight_kg IS NOT NULL AND dispatch_weight_kg - received_weight_kg > 10`)!,
  };
}

// ---------- money ----------
export type InvoiceRow = {
  id: number; invoice_no: string; kind: 'PURCHASE' | 'SALE'; party_id: number; party_name: string;
  booking_no: string | null; invoice_date: string; qty_mt: number; rate_inr_mt: number;
  base_amount: number; gst_amount: number; total_amount: number; due_date: string;
  paid: number; outstanding: number; overdue_days: number;
};

export function invoices(kind?: string, onlyUnpaid = false): InvoiceRow[] {
  const where: string[] = [];
  const params: string[] = [];
  if (kind === 'PURCHASE' || kind === 'SALE') { where.push('i.kind = ?'); params.push(kind); }
  if (onlyUnpaid) where.push('i.total_amount - IFNULL(pay.paid, 0) > 1');
  return all<InvoiceRow>(
    `SELECT i.id, i.invoice_no, i.kind, i.party_id, p.name party_name, b.booking_no,
            i.invoice_date, i.qty_mt, i.rate_inr_mt, i.base_amount, i.gst_amount, i.total_amount, i.due_date,
            IFNULL(pay.paid, 0) paid,
            ROUND(i.total_amount - IFNULL(pay.paid, 0), 2) outstanding,
            CAST(MAX(0, julianday(date('now')) - julianday(i.due_date)) AS INTEGER) overdue_days
     FROM invoices i
     JOIN parties p ON p.id = i.party_id
     LEFT JOIN bookings b ON b.id = i.booking_id
     LEFT JOIN ${PAID_AGG} pay ON pay.invoice_id = i.id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY i.invoice_date DESC, i.id DESC`, ...params);
}

export type PaymentRow = {
  id: number; direction: 'IN' | 'OUT'; party_name: string; invoice_no: string | null;
  payment_date: string; amount: number; mode: string; utr_no: string | null; bank: string | null;
};

export function payments(direction?: string): PaymentRow[] {
  const filtered = direction === 'IN' || direction === 'OUT';
  return all<PaymentRow>(
    `SELECT pm.id, pm.direction, p.name party_name, i.invoice_no,
            pm.payment_date, pm.amount, pm.mode, pm.utr_no, pm.bank
     FROM payments pm
     JOIN parties p ON p.id = pm.party_id
     LEFT JOIN invoices i ON i.id = pm.invoice_id
     ${filtered ? 'WHERE pm.direction = ?' : ''}
     ORDER BY pm.payment_date DESC, pm.id DESC`, ...(filtered ? [direction!] : []));
}

export function moneySummary() {
  const side = (kind: string) => get<{ total: number; overdue: number; due7: number }>(
    `SELECT IFNULL(SUM(i.total_amount - IFNULL(p.paid, 0)), 0) total,
            IFNULL(SUM(CASE WHEN i.due_date < date('now') THEN i.total_amount - IFNULL(p.paid, 0) END), 0) overdue,
            IFNULL(SUM(CASE WHEN i.due_date >= date('now') AND i.due_date <= date('now', '+7 days')
                       THEN i.total_amount - IFNULL(p.paid, 0) END), 0) due7
     FROM invoices i
     LEFT JOIN ${PAID_AGG} p ON p.invoice_id = i.id
     WHERE i.kind = ? AND i.total_amount - IFNULL(p.paid, 0) > 1`, kind)!;
  return { receivable: side('SALE'), payable: side('PURCHASE') };
}

/** Receivables aging buckets for the Money page. */
export function receivableAging() {
  return all<{ bucket: string; amount: number }>(
    `SELECT CASE
              WHEN i.due_date >= date('now') THEN 'Not yet due'
              WHEN julianday(date('now')) - julianday(i.due_date) <= 15 THEN '1–15 days late'
              WHEN julianday(date('now')) - julianday(i.due_date) <= 30 THEN '16–30 days late'
              ELSE 'Over 30 days late'
            END bucket,
            SUM(i.total_amount - IFNULL(p.paid, 0)) amount
     FROM invoices i
     LEFT JOIN ${PAID_AGG} p ON p.invoice_id = i.id
     WHERE i.kind = 'SALE' AND i.total_amount - IFNULL(p.paid, 0) > 1
     GROUP BY bucket`);
}

// ---------- profit ----------
/** Monthly bought vs sold value (base amounts, before GST). */
export function monthlyTrade() {
  return all<{ month: string; bought: number; sold: number; bought_qty: number; sold_qty: number }>(
    `SELECT strftime('%Y-%m', invoice_date) month,
            IFNULL(SUM(CASE WHEN kind = 'PURCHASE' THEN base_amount END), 0) bought,
            IFNULL(SUM(CASE WHEN kind = 'SALE' THEN base_amount END), 0) sold,
            IFNULL(SUM(CASE WHEN kind = 'PURCHASE' THEN qty_mt END), 0) bought_qty,
            IFNULL(SUM(CASE WHEN kind = 'SALE' THEN qty_mt END), 0) sold_qty
     FROM invoices GROUP BY month ORDER BY month`);
}

/** Realized margin on back-to-back deals: sale linked to purchase, both priced. */
export function dealMargins() {
  return all<{
    sale_no: string; purchase_no: string; customer: string; supplier: string;
    qty: number; sale_rate: number; buy_rate: number; margin_mt: number; margin_total: number; sale_date: string;
  }>(
    `SELECT s.booking_no sale_no, pb.booking_no purchase_no,
            cp.name customer, sup.name supplier,
            ${DEAL_QTY} qty,
            ROUND(sf.rate) sale_rate, ROUND(pf.rate) buy_rate,
            ROUND(sf.rate - pf.rate) margin_mt,
            ROUND((sf.rate - pf.rate) * ${DEAL_QTY}) margin_total,
            s.booking_date sale_date
     ${MATCHED_DEALS}
     ORDER BY s.booking_date DESC`);
}

export function customerProfit() {
  return all<{ customer: string; deals: number; qty: number; margin: number }>(
    `SELECT cp.name customer, COUNT(*) deals,
            ROUND(SUM(${DEAL_QTY}), 1) qty,
            ROUND(SUM((sf.rate - pf.rate) * ${DEAL_QTY})) margin
     ${MATCHED_DEALS}
     GROUP BY cp.name ORDER BY margin DESC`);
}

// ---------- supplier performance ----------
export type SupplierScore = {
  id: number; name: string;
  delivered_mt: number;
  margin_total: number;
  margin_mt: number | null;
  trips: number;
  ontime_trips: number;
  ontime_pct: number | null;
  avg_transit_days: number | null;
  short_trips: number;
  short_kg: number;
  weighed_trips: number;
};

export function supplierScorecard(): SupplierScore[] {
  // Correlated on the outer supplier alias `sp` (MATCHED_DEALS itself uses `sup`).
  const marginSql = (select: string) => `(SELECT ${select} ${MATCHED_DEALS} AND sup.id = sp.id)`;
  const rows = all<SupplierScore>(
    `SELECT sp.id, sp.name,
        IFNULL((SELECT SUM(l.qty_mt) FROM liftings l JOIN bookings b ON b.id = l.booking_id
                WHERE b.party_id = sp.id AND b.kind = 'PURCHASE'), 0) delivered_mt,
        IFNULL(${marginSql(`SUM((sf.rate - pf.rate) * ${DEAL_QTY})`)}, 0) margin_total,
        ${marginSql(`SUM((sf.rate - pf.rate) * ${DEAL_QTY}) / SUM(${DEAL_QTY})`)} margin_mt,
        IFNULL((SELECT COUNT(*) FROM liftings l JOIN bookings b ON b.id = l.booking_id
                WHERE b.party_id = sp.id AND b.kind = 'PURCHASE' AND b.lift_by_date IS NOT NULL), 0) trips,
        IFNULL((SELECT COUNT(*) FROM liftings l JOIN bookings b ON b.id = l.booking_id
                WHERE b.party_id = sp.id AND b.kind = 'PURCHASE' AND b.lift_by_date IS NOT NULL
                  AND l.dispatch_date <= b.lift_by_date), 0) ontime_trips,
        (SELECT AVG(julianday(l.arrived_date) - julianday(l.dispatch_date))
                FROM liftings l JOIN bookings b ON b.id = l.booking_id
                WHERE b.party_id = sp.id AND b.kind = 'PURCHASE' AND l.arrived_date IS NOT NULL) avg_transit_days,
        IFNULL((SELECT COUNT(*) FROM liftings l JOIN bookings b ON b.id = l.booking_id
                WHERE b.party_id = sp.id AND b.kind = 'PURCHASE'
                  AND l.received_weight_kg IS NOT NULL AND l.dispatch_weight_kg - l.received_weight_kg > 10), 0) short_trips,
        IFNULL((SELECT SUM(l.dispatch_weight_kg - l.received_weight_kg)
                FROM liftings l JOIN bookings b ON b.id = l.booking_id
                WHERE b.party_id = sp.id AND b.kind = 'PURCHASE'
                  AND l.received_weight_kg IS NOT NULL AND l.dispatch_weight_kg - l.received_weight_kg > 10), 0) short_kg,
        IFNULL((SELECT COUNT(*) FROM liftings l JOIN bookings b ON b.id = l.booking_id
                WHERE b.party_id = sp.id AND b.kind = 'PURCHASE' AND l.received_weight_kg IS NOT NULL), 0) weighed_trips
     FROM parties sp
     WHERE sp.type = 'SUPPLIER'
     ORDER BY margin_total DESC`);
  return rows.map((r) => ({
    ...r,
    ontime_pct: r.trips > 0 ? Math.round((r.ontime_trips / r.trips) * 100) : null,
  }));
}

/** Where-to-buy data: current effective rate + 8-week rate history per supplier. */
export type BuyOption = {
  id: number; name: string; city: string | null; contact_person: string | null; phone: string | null;
  credit_days: number;
  rate_mt: number;               // what they'd charge today, ₹/MT
  history_mt: number[];          // 8 weekly points, oldest → latest, ₹/MT
  trend_wk_mt: number;           // avg ₹/MT change per week (negative = getting cheaper)
  ontime: 'good' | 'ok' | 'bad';
  weight: 'good' | 'ok' | 'bad';
};

function grade(value: number | null, goodAt: number, okAt: number, higherIsBetter: boolean): 'good' | 'ok' | 'bad' {
  if (value == null) return 'ok';
  const v = higherIsBetter ? value : -value;
  if (v >= (higherIsBetter ? goodAt : -goodAt)) return 'good';
  if (v >= (higherIsBetter ? okAt : -okAt)) return 'ok';
  return 'bad';
}

/** What the trader typically sells at today: market price + their usual sale premium (₹/MT). */
export function typicalSellRate(): number {
  const csp = cspToday().price;
  const prem = get<{ p: number | null }>(
    `SELECT AVG(premium_inr_mt) p FROM bookings
     WHERE kind = 'SALE' AND booking_date > date('now', '-60 days')`)?.p
    ?? get<{ p: number | null }>(`SELECT AVG(premium_inr_mt) p FROM bookings WHERE kind = 'SALE'`)?.p;
  return Math.round((csp + (prem ?? 6000)) / 100) * 100;
}

export function whereToBuy(): BuyOption[] {
  const scores = Object.fromEntries(supplierScorecard().map((s) => [s.id, s]));
  const suppliers = all<{ id: number; name: string; city: string | null; contact_person: string | null; phone: string | null; credit_days: number; premium: number }>(
    `SELECT p.id, p.name, p.city, p.contact_person, p.phone, p.credit_days,
            IFNULL((SELECT AVG(premium_inr_mt) FROM bookings WHERE party_id = p.id AND kind = 'PURCHASE'), 3000) premium
     FROM parties p WHERE p.type = 'SUPPLIER' ORDER BY p.name`);

  return suppliers.map((s) => {
    // 8 weekly points: this supplier's actual fixation average that week,
    // else market price (CSP) + their usual premium.
    const history: number[] = [];
    for (let w = 7; w >= 0; w--) {
      const from = `-${(w + 1) * 7} days`;
      const to = `-${w * 7} days`;
      const fix = get<{ v: number | null }>(
        `SELECT SUM(f.qty_mt * f.price_inr_mt) / SUM(f.qty_mt) v
         FROM price_fixations f JOIN bookings b ON b.id = f.booking_id
         WHERE b.party_id = ? AND b.kind = 'PURCHASE'
           AND f.fixation_date > date('now', ?) AND f.fixation_date <= date('now', ?)`,
        s.id, from, to)?.v;
      const csp = get<{ v: number | null }>(
        `SELECT AVG(price_inr_mt) v FROM csp_prices
         WHERE price_date > date('now', ?) AND price_date <= date('now', ?)`, from, to)?.v;
      const point = fix ?? (csp != null ? csp + s.premium : history.at(-1));
      history.push(Math.round((point ?? 0) / 100) * 100);
    }
    const score = scores[s.id];
    const shortRatio = score && score.weighed_trips > 0 ? score.short_trips / score.weighed_trips : null;
    return {
      id: s.id, name: s.name, city: s.city, contact_person: s.contact_person, phone: s.phone,
      credit_days: s.credit_days,
      rate_mt: history[history.length - 1],
      history_mt: history,
      trend_wk_mt: Math.round((history[history.length - 1] - history[0]) / 7),
      ontime: grade(score?.ontime_pct ?? null, 85, 60, true),
      weight: shortRatio == null ? 'ok' : shortRatio <= 0.15 ? 'good' : shortRatio <= 0.35 ? 'ok' : 'bad',
    };
  });
}

// ---------- parties ----------
export type PartySummary = {
  id: number; name: string; type: string; city: string; contact_person: string; phone: string;
  credit_days: number; volume_mt: number; outstanding: number; overdue: number;
  billed_total: number; open_orders: number; open_qty: number;
};

const PARTY_SUMMARY_FIELDS = `
  IFNULL((SELECT SUM(total_amount) FROM invoices WHERE party_id = p.id), 0) billed_total,
  IFNULL((SELECT COUNT(*) FROM bookings WHERE party_id = p.id AND status = 'OPEN'), 0) open_orders,
  IFNULL((SELECT ROUND(SUM(qty_mt), 1) FROM bookings WHERE party_id = p.id AND status = 'OPEN'), 0) open_qty,
  IFNULL((SELECT ROUND(SUM(qty_mt), 1) FROM invoices WHERE party_id = p.id), 0) volume_mt,
  ${PARTY_OUTSTANDING()} outstanding,
  ${PARTY_OUTSTANDING(`AND i.due_date < date('now')`)} overdue`;

export function partySummaries(type: 'SUPPLIER' | 'CUSTOMER'): PartySummary[] {
  return all<PartySummary>(
    `SELECT p.id, p.name, p.type, p.city, p.contact_person, p.phone, p.credit_days, ${PARTY_SUMMARY_FIELDS}
     FROM parties p WHERE p.type = ? ORDER BY outstanding DESC, p.name`, type);
}

export function party(id: number) {
  return get<PartySummary & { gstin: string; notes: string }>(
    `SELECT p.*, ${PARTY_SUMMARY_FIELDS} FROM parties p WHERE p.id = ?`, id);
}

/** Chronological ledger: invoices (debit) and payments (credit).
 *  Uses anonymous `?` params (Railway's Node 22 node:sqlite mis-binds numbered `?1`). */
export function partyLedger(id: number) {
  return all<{ entry_date: string; type: string; ref: string; debit: number | null; credit: number | null; detail: string }>(
    `SELECT * FROM (
       SELECT i.invoice_date entry_date, 'INVOICE' type, i.invoice_no ref,
              i.total_amount debit, NULL credit,
              ROUND(i.qty_mt, 1) || ' MT @ ₹' || CAST(ROUND(i.rate_inr_mt) AS INTEGER) detail
       FROM invoices i WHERE i.party_id = ?
       UNION ALL
       SELECT pm.payment_date, 'PAYMENT', IFNULL(pm.utr_no, pm.mode),
              NULL, pm.amount,
              pm.mode || IFNULL(' · ' || pm.bank, '')
       FROM payments pm WHERE pm.party_id = ?
     ) ORDER BY entry_date, type DESC`, id, id);
}

// ---------- alerts (Today page) ----------
export type Alert = { severity: 'critical' | 'warning' | 'info'; title: string; detail: string; href: string };

/** DNPL provisional-pricing deadline (PI terms): material bought on the 1st–15th
 *  must be priced before month-end; bought on the 16th–end, before the 15th of the
 *  next month. Returns the deadline as YYYY-MM-DD. */
export function dnplDeadline(bookingDate: string): string {
  const d = new Date(bookingDate + 'T00:00:00Z');
  const end = d.getUTCDate() <= 15
    ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))   // last day of this month
    : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 15)); // 15th of next month
  return end.toISOString().slice(0, 10);
}

export function alerts(): Alert[] {
  const out: Alert[] = [];
  for (const r of all<{ party: string; amt: number; days: number; n: number }>(
    `SELECT p.name party, SUM(i.total_amount - IFNULL(pp.paid, 0)) amt,
            MAX(CAST(julianday(date('now')) - julianday(i.due_date) AS INTEGER)) days, COUNT(*) n
     FROM invoices i JOIN parties p ON p.id = i.party_id
     LEFT JOIN ${PAID_AGG} pp ON pp.invoice_id = i.id
     WHERE i.kind = 'SALE' AND i.due_date < date('now') AND i.total_amount - IFNULL(pp.paid, 0) > 1
     GROUP BY p.name ORDER BY amt DESC LIMIT 5`)) {
    out.push({
      severity: r.days > 15 ? 'critical' : 'warning',
      title: `${r.party} payment late by ${r.days} days`,
      detail: `${r.n} bill${r.n > 1 ? 's' : ''} pending`,
      href: '/money?kind=SALE&unpaid=1',
    });
  }
  for (const r of all<{ booking_no: string; party: string; qty: number }>(
    `SELECT b.booking_no, p.name party, ROUND(b.qty_mt - IFNULL(f.q, 0), 1) qty
     FROM bookings b JOIN parties p ON p.id = b.party_id
     LEFT JOIN ${FIX_AGG} f ON f.booking_id = b.id
     LEFT JOIN ${LIFT_AGG} l ON l.booking_id = b.id
     WHERE b.status = 'OPEN' AND b.pricing_basis = 'PRICE_LATER' AND IFNULL(l.q, 0) > IFNULL(f.q, 0)`)) {
    out.push({
      severity: 'warning',
      title: `${r.booking_no}: ${r.qty} MT lifted but price not fixed`,
      detail: `${r.party} — price moves daily, this is open risk`,
      href: '/bookings?status=OPEN',
    });
  }
  // DNPL pricing window closing + $200/MT margin-call risk on unpriced price-later lots
  for (const r of all<{ booking_no: string; party: string; qty: number; booking_date: string; book_lme: number | null; cur_lme: number | null }>(
    `SELECT b.booking_no, p.name party, ROUND(b.qty_mt - IFNULL(f.q, 0), 1) qty, b.booking_date,
            (SELECT usd_mt FROM lme_prices WHERE price_date <= b.booking_date ORDER BY price_date DESC LIMIT 1) book_lme,
            (SELECT usd_mt FROM lme_prices ORDER BY price_date DESC LIMIT 1) cur_lme
     FROM bookings b JOIN parties p ON p.id = b.party_id
     LEFT JOIN ${FIX_AGG} f ON f.booking_id = b.id
     WHERE b.status = 'OPEN' AND b.pricing_basis = 'PRICE_LATER' AND b.qty_mt - IFNULL(f.q, 0) > 0.05`)) {
    const dl = dnplDeadline(r.booking_date);
    const days = Math.round((Date.parse(dl) - Date.now()) / 86_400_000);
    if (days <= 7) {
      out.push({
        severity: days < 0 ? 'critical' : 'warning',
        title: `${r.booking_no}: DNPL pricing ${days < 0 ? `overdue by ${-days} day${days === -1 ? '' : 's'}` : `due in ${days} day${days === 1 ? '' : 's'}`}`,
        detail: `${r.qty} MT unpriced with ${r.party} — fix by ${dl} or it settles at market`,
        href: '/add?what=price-fix',
      });
    }
    const move = r.book_lme && r.cur_lme ? Math.abs(r.cur_lme - r.book_lme) : 0;
    if (move >= 200) {
      out.push({
        severity: move >= 400 ? 'critical' : 'warning',
        title: `${r.booking_no}: LME moved $${Math.round(move)}/MT — margin-call risk`,
        detail: `${r.qty} MT unpriced with ${r.party} (booked ~$${Math.round(r.book_lme!)}, now ~$${Math.round(r.cur_lme!)})`,
        href: '/add?what=price-fix',
      });
    }
  }
  for (const r of all<{ booking_no: string; party: string; days: number }>(
    `SELECT b.booking_no, p.name party, CAST(julianday(b.lift_by_date) - julianday(date('now')) AS INTEGER) days
     FROM bookings b JOIN parties p ON p.id = b.party_id
     LEFT JOIN ${LIFT_AGG} l ON l.booking_id = b.id
     WHERE b.status = 'OPEN' AND b.qty_mt - IFNULL(l.q, 0) > 0.05
       AND b.lift_by_date BETWEEN date('now') AND date('now', '+7 days')`)) {
    out.push({
      severity: 'info',
      title: `${r.booking_no}: lifting window closes in ${r.days} day${r.days === 1 ? '' : 's'}`,
      detail: `Material pending with ${r.party}`,
      href: '/bookings?status=OPEN',
    });
  }
  const order = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 8);
}

// ---------- monthly procurement plan (dashboard + suppliers) ----------
export type SupplierMonthRow = {
  supplier_id: number; supplier: string; city: string | null; phone: string | null;
  manual_rank: number | null;
  target_mt: number; agreed_mt: number; lifted_mt: number; avg_cost_kg: number | null;
};

/** Per-supplier plan for one 'YYYY-MM': target & agreed (from supplier_targets),
 *  lifted & blended cost (derived from liftings priced via price_fixations). */
export function monthlyPlan(month: string): SupplierMonthRow[] {
  return all<SupplierMonthRow>(
    `SELECT p.id supplier_id, p.name supplier, p.city, p.phone, p.manual_rank,
            IFNULL(t.target_mt, 0) target_mt, IFNULL(t.agreed_mt, 0) agreed_mt,
            IFNULL(l.lifted_mt, 0) lifted_mt,
            l.avg_rate_mt / 1000.0 avg_cost_kg
     FROM parties p
     LEFT JOIN (SELECT supplier_id, SUM(target_mt) target_mt, SUM(agreed_mt) agreed_mt
                FROM supplier_targets WHERE month = ? GROUP BY supplier_id) t ON t.supplier_id = p.id
     LEFT JOIN (SELECT b.party_id, SUM(l.qty_mt) lifted_mt,
                       SUM(l.qty_mt * f.rate) / NULLIF(SUM(l.qty_mt), 0) avg_rate_mt
                FROM liftings l JOIN bookings b ON b.id = l.booking_id
                LEFT JOIN ${FIX_AGG} f ON f.booking_id = b.id
                WHERE b.kind = 'PURCHASE' AND strftime('%Y-%m', l.dispatch_date) = ?
                GROUP BY b.party_id) l ON l.party_id = p.id
     WHERE p.type = 'SUPPLIER' AND (t.supplier_id IS NOT NULL OR l.party_id IS NOT NULL)
     ORDER BY (p.manual_rank IS NULL), p.manual_rank, p.name`, month, month);
}

/** Cost of purchase for the month: committed (PO gross, or purchase invoices until POs exist)
 *  and actually paid out to suppliers. */
export function costOfPurchase(month: string): { committed: number; paid: number; poCount: number } {
  const po = get<{ committed: number; n: number }>(
    `SELECT IFNULL(SUM(gross_amount), 0) committed, COUNT(*) n
     FROM purchase_orders WHERE status = 'SENT' AND month = ?`, month)!;
  const paid = get<{ paid: number }>(
    `SELECT IFNULL(SUM(pm.amount), 0) paid FROM payments pm JOIN parties p ON p.id = pm.party_id
     WHERE pm.direction = 'OUT' AND p.type = 'SUPPLIER' AND strftime('%Y-%m', pm.payment_date) = ?`, month)!;
  let committed = po.committed;
  if (po.n === 0) {
    committed = get<{ c: number }>(
      `SELECT IFNULL(SUM(total_amount), 0) c FROM invoices
       WHERE kind = 'PURCHASE' AND strftime('%Y-%m', invoice_date) = ?`, month)!.c;
  }
  return { committed, paid: paid.paid, poCount: po.n };
}
