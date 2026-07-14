import { cspToday } from '@/lib/queries';
import { perKg, dateLong, inrFull } from '@/lib/format';
import { runWithTenant } from '@/lib/tenant';
import { resolveTenant } from '@/lib/tenant-resolve';

// PageHead renders as a child of each page, i.e. outside that page's tenant
// scope (Next renders it as separate work), so it re-enters the scope itself to
// read the caller's copper price. resolveTenant() is cache()'d — no extra cost.
export async function PageHead({ title, sub }: { title: string; sub: string }) {
  const csp = await runWithTenant(await resolveTenant(), () => cspToday());
  const up = csp.change >= 0;
  return (
    <header className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-sub">{sub}</p>
      </div>
      <div className="head-price">
        <div className="lbl">Copper price · {dateLong(csp.date)}</div>
        <div className="val" title={`${inrFull(csp.price)} per MT`}>
          {perKg(csp.price)}{' '}
          <span className={up ? 'pos' : 'neg'}>{up ? '▲' : '▼'} {Math.abs(csp.change / 1000).toFixed(1)}</span>
        </div>
      </div>
    </header>
  );
}

export function Tile({ label, value, note, tone, accent }: {
  label: string; value: string; note?: React.ReactNode;
  tone?: 'good' | 'bad' | 'warn'; accent?: boolean;
}) {
  return (
    <div className={`card tile${tone ? ` t-${tone}` : ''}${accent ? ' accent' : ''}`}>
      <div className="t-label">{label}</div>
      <div className="t-value">{value}</div>
      {note ? <div className="t-note">{note}</div> : null}
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'neutral' | 'copper'; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}><span className="dot" />{children}</span>;
}

/** One place for the booking status → pill mapping (PRD: Running=amber, Finished=green). */
export function StatusBadge({ status }: { status: string }) {
  if (status === 'OPEN') return <Badge tone="warn">Running</Badge>;
  if (status === 'COMPLETED') return <Badge tone="good">Finished</Badge>;
  return <Badge tone="bad">Cancelled</Badge>;
}

/** Booking progress: how much is priced, how much has moved. Plain and visual. */
export function Pipeline({ qty, fixed, lifted }: { qty: number; fixed: number; lifted: number }) {
  const num = (x: number) => (typeof x === 'number' && isFinite(x) ? x : 0);
  const q = num(qty);
  const pct = (x: number) => (q > 0 ? Math.min(100, Math.round((num(x) / q) * 100)) : 0);
  const rows = [
    { label: 'Priced', value: num(fixed), cls: 'price' },
    { label: 'Moved', value: num(lifted), cls: '' },
  ];
  return (
    <div className="pipe">
      {rows.map((r) => (
        <div className="pipe-row" key={r.label}>
          <span className="plabel">{r.label}</span>
          <span className="pipe-bar">
            <span className={`pipe-fill ${pct(r.value) >= 100 ? 'full' : r.cls}`} style={{ width: `${pct(r.value)}%` }} />
          </span>
          <span className="pipe-pct">{r.value.toLocaleString('en-IN', { maximumFractionDigits: 1 })}/{q}</span>
        </div>
      ))}
    </div>
  );
}
