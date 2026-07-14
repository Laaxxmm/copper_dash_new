import Link from 'next/link';
import { mt } from '@/lib/format';
import type { SupplierScore } from '@/lib/queries';

// Margin ₹/kg → colour-graded pill: red when negative, green with intensity by size.
function marginStyle(mMt: number | null) {
  if (mMt == null) return null;
  const kg = mMt / 1000;
  if (kg < 0) return { bg: 'var(--bad-wash)', color: 'var(--bad)', text: `₹${kg.toFixed(1)}` };
  const a = Math.min(0.30, 0.10 + kg / 25).toFixed(2);
  return { bg: `rgba(47,125,79,${a})`, color: '#1f5a38', text: `+₹${kg.toFixed(1)}` };
}

export default function SupplierCompare({ scores }: { scores: SupplierScore[] }) {
  if (!scores.length) return <p className="card-pad muted">No supplier deals matched yet — link sell orders to their purchase lots to compare.</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr><th>Supplier</th><th>Margin ₹/kg</th><th className="num">Volume</th><th>On-time</th><th className="num">Transit</th><th>Weight cut</th></tr>
        </thead>
        <tbody>
          {scores.map((s) => {
            const m = marginStyle(s.margin_mt);
            const ot = s.ontime_pct == null ? null : s.ontime_pct >= 100 ? 'good' : s.ontime_pct >= 80 ? 'warn' : 'bad';
            return (
              <tr key={s.id}>
                <td><Link href={`/suppliers/${s.id}`} className="cell-main" style={{ color: 'var(--copper-text)' }}>{s.name}</Link></td>
                <td>{m ? <span className="gpill" style={{ background: m.bg, color: m.color }}>{m.text}</span> : '—'}</td>
                <td className="num">{mt(Math.round(s.delivered_mt * 10) / 10)}</td>
                <td>{ot ? <span className={`spill ${ot}`}>{s.ontime_pct}%</span> : '—'}</td>
                <td className="num">{s.avg_transit_days != null ? `${s.avg_transit_days.toFixed(1)} d` : '—'}</td>
                <td>{s.short_kg > 0 ? <span className="spill bad">{Math.round(s.short_kg)} kg</span> : <span className="muted">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
