import { inr } from '@/lib/format';

/** Profit build-up: gross margin (green) with overheads (red) taken out → net.
 *  When net ≥ 0 the green + red segments together are the gross; a loss goes all red. */
export default function ProfitBar({ gross, overheads, net }: { gross: number; overheads: number; net: number }) {
  const netPct = gross > 0 ? Math.max(0, Math.min(100, (net / gross) * 100)) : 0;
  const ohPct = gross > 0 ? Math.min(100 - netPct, (overheads / gross) * 100) : 100;
  return (
    <div className="pbar">
      <div className="pbar-track">
        <span className="pbar-net" style={{ width: `${netPct}%` }} title={`Net ${inr(net)}`} />
        <span className="pbar-oh" style={{ width: `${ohPct}%` }} title={`Overheads ${inr(overheads)}`} />
      </div>
      <div className="pbar-legend">
        <span><i className="pdot net" /> Gross margin <b>{inr(gross)}</b></span>
        <span><i className="pdot oh" /> − Overheads <b>{inr(overheads)}</b></span>
        <span> = Net <b style={{ color: net < 0 ? 'var(--bad)' : 'var(--good)' }}>{inr(net)}</b></span>
      </div>
    </div>
  );
}
