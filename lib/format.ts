// Formatting helpers — Indian numbering, plain language.
// They render values straight from the DB, which can be null/undefined for an
// empty aggregate — so coerce to a finite number rather than crash the page.
const n = (x: unknown): number => (typeof x === 'number' && isFinite(x) ? x : Number(x)) || 0;

export function inr(amount: number, opts: { compact?: boolean } = {}): string {
  const a = n(amount);
  const abs = Math.abs(a);
  if (opts.compact !== false) {
    if (abs >= 1_00_00_000) return `₹${(a / 1_00_00_000).toFixed(2)} Cr`;
    if (abs >= 1_00_000) return `₹${(a / 1_00_000).toFixed(1)} L`;
  }
  return `₹${a.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function inrFull(amount: number): string {
  return `₹${n(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/** Rate per MT shown the way the trade talks: ₹/kg */
export function perKg(ratePerMt: number): string {
  return `₹${(n(ratePerMt) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })}/kg`;
}

export function mt(qty: number): string {
  return `${n(qty).toLocaleString('en-IN', { maximumFractionDigits: 1 })} MT`;
}

export function dateShort(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function dateLong(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso + 'T00:00:00Z').getTime() - new Date(fromIso + 'T00:00:00Z').getTime()) / 86400000);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const BASIS_LABEL: Record<string, string> = {
  DAY_PRICE: "Day's price",
  WEEK_AVG: 'Week average',
  FORTNIGHT_AVG: '15-day average',
  MONTH_AVG: 'Month average',
  FIXED: 'Fixed rate',
  PRICE_LATER: 'Price later',
};

export const TRUCK_LABEL: Record<string, string> = {
  IN_TRANSIT: 'On the road',
  ARRIVED: 'Arrived, not unloaded',
  UNLOADED: 'Unloaded',
};

export const MODE_LABEL: Record<string, string> = {
  RTGS: 'RTGS', NEFT: 'NEFT', IMPS: 'IMPS', UPI: 'UPI', CHEQUE: 'Cheque', CASH: 'Cash',
};

export function monthLabel(ym: string): string {
  const d = new Date(ym + '-01T00:00:00');
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}
