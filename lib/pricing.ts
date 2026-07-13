// DB-backed pricing: resolve the LME number for a chosen basis, the FX rate for
// a party's TT source, and compute the per-product supplier board (L1..Ln).
import { all, get } from './db';
import { ratePerKg } from './formula';

export type PriceBasis = 'CSP' | 'DAY' | 'RUNNING' | 'PERIODIC' | 'WEEK_AVG' | 'FORTNIGHT_AVG' | 'MONTH_AVG';

export const BASIS_LABEL: Record<PriceBasis, string> = {
  CSP: 'CSP (cash settlement)',
  DAY: "Day's price",
  RUNNING: 'Running (that day)',
  PERIODIC: 'Periodic (N-day avg)',
  WEEK_AVG: 'Weekly average',
  FORTNIGHT_AVG: 'Fortnightly average',
  MONTH_AVG: 'Monthly average',
};

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export type LmePoint = { usd_mt: number; price_date: string; source: string };

export function latestLme(): LmePoint | undefined {
  return get<LmePoint>(`SELECT usd_mt, price_date, source FROM lme_prices ORDER BY price_date DESC LIMIT 1`);
}

export function lmeHistory(days: number): { price_date: string; usd_mt: number }[] {
  return all<{ price_date: string; usd_mt: number }>(
    `SELECT price_date, usd_mt FROM lme_prices ORDER BY price_date DESC LIMIT ?`, days).reverse();
}

/** LME USD/MT for a basis, as of a date. Averages use the trading days in the window. */
export function resolveLme(basis: PriceBasis, asOf: string = today(), periodDays = 3): number | null {
  const onOrBefore = (d: string) =>
    get<{ v: number }>(`SELECT usd_mt v FROM lme_prices WHERE price_date <= ? ORDER BY price_date DESC LIMIT 1`, d)?.v ?? null;
  const avg = (from: string, to: string) => {
    const r = get<{ v: number | null }>(
      `SELECT AVG(usd_mt) v FROM lme_prices WHERE price_date BETWEEN ? AND ?`, from, to)?.v;
    return r ?? onOrBefore(to);
  };
  switch (basis) {
    case 'CSP':
    case 'DAY':
    case 'RUNNING':      return onOrBefore(asOf);
    case 'PERIODIC':     return avg(addDays(asOf, -(periodDays - 1)), asOf);
    case 'WEEK_AVG':     return avg(addDays(asOf, -6), asOf);
    case 'FORTNIGHT_AVG':return avg(addDays(asOf, -14), asOf);
    case 'MONTH_AVG':    return avg(`${asOf.slice(0, 7)}-01`, asOf);
  }
}

/** The TT rate for a basis (RBI_TT / SBI_TT), latest on or before a date. */
export function fxRate(basis: string, asOf: string = today()): number {
  return (
    get<{ r: number }>(`SELECT usd_inr r FROM fx_rates WHERE basis = ? AND rate_date <= ? ORDER BY rate_date DESC LIMIT 1`, basis, asOf)?.r ??
    get<{ r: number }>(`SELECT usd_inr r FROM fx_rates WHERE basis = ? ORDER BY rate_date DESC LIMIT 1`, basis)?.r ??
    89
  );
}

/** LME strip for the Today header: LME (live override or last saved) + FX + ₹/kg indication. */
export function lmeStrip(liveUsd?: number | null) {
  const hist = lmeHistory(2);
  const dbLatest = hist.at(-1)?.usd_mt ?? null;
  const dbPrev = hist.length === 2 ? hist[0].usd_mt : null;
  const usd_mt = liveUsd ?? dbLatest;
  if (usd_mt == null) return null;
  const ref = liveUsd != null ? dbLatest : dbPrev; // day-over-day, or live vs last-saved
  const changePct = ref != null && ref > 0 ? ((usd_mt - ref) / ref) * 100 : null;
  const fx = fxRate('RBI_TT');
  return { usd_mt, changePct, fx, inrPerKg: (usd_mt * fx) / 1000, live: liveUsd != null };
}

export type Product = { id: number; type: 'WIRE' | 'ROD'; size_mm: number; description: string };

export function products(): Product[] {
  return all<Product>(`SELECT id, type, size_mm, description FROM products ORDER BY type DESC, size_mm`);
}

export type BoardRow = {
  supplier_id: number; supplier: string; city: string | null; phone: string | null;
  premium_usd_mt: number; transaction_usd_mt: number; factor_pct: number; handling_inr_mt: number;
  exchange_basis: string; exchange_rate: number;
  rate_inr_kg: number; delivery_days: number | null; credit_days: number | null; tier: string;
};

/** Per-product supplier board, ranked cheapest-first as L1..Ln. */
export function supplierBoard(productId: number, opts: { lme?: number; basis?: PriceBasis } = {}) {
  const product = get<Product>(`SELECT id, type, size_mm, description FROM products WHERE id = ?`, productId);
  const latest = latestLme();
  const asOf = latest?.price_date ?? today();
  const basis = opts.basis ?? 'DAY';
  const lme = opts.lme ?? resolveLme(basis, asOf) ?? latest?.usd_mt ?? 0;

  const terms = all<{
    supplier_id: number; supplier: string; city: string | null; phone: string | null;
    premium_usd_mt: number; transaction_usd_mt: number; factor_pct: number; handling_inr_mt: number;
    exchange_basis: string | null; delivery_days: number | null; credit_days: number | null;
  }>(
    `SELECT st.supplier_id, p.name supplier, p.city, p.phone,
            st.premium_usd_mt, st.transaction_usd_mt, st.factor_pct, st.handling_inr_mt,
            p.exchange_basis, st.delivery_days,
            IFNULL(st.credit_days, p.credit_days) credit_days
     FROM supplier_terms st JOIN parties p ON p.id = st.supplier_id
     WHERE st.product_id = ?`, productId);

  const rows: BoardRow[] = terms.map((t) => {
    const exchange_basis = t.exchange_basis ?? 'RBI_TT';
    const exchange_rate = fxRate(exchange_basis, asOf);
    return {
      supplier_id: t.supplier_id, supplier: t.supplier, city: t.city, phone: t.phone,
      premium_usd_mt: t.premium_usd_mt, transaction_usd_mt: t.transaction_usd_mt,
      factor_pct: t.factor_pct, handling_inr_mt: t.handling_inr_mt,
      exchange_basis, exchange_rate,
      rate_inr_kg: ratePerKg({
        lme_usd_mt: lme, premium_usd_mt: t.premium_usd_mt, transaction_usd_mt: t.transaction_usd_mt,
        factor_pct: t.factor_pct, exchange_rate, handling_inr_mt: t.handling_inr_mt,
      }),
      delivery_days: t.delivery_days, credit_days: t.credit_days, tier: '',
    };
  });
  rows.sort((a, b) => a.rate_inr_kg - b.rate_inr_kg);
  rows.forEach((r, i) => (r.tier = `L${i + 1}`));
  return { product, lme, basis, asOf, source: latest?.source ?? 'manual', rows };
}
