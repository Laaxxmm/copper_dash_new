import Link from 'next/link';
import { inr, inrFull } from '@/lib/format';
import type { AgeingRow } from '@/lib/queries';

const COLS: { key: keyof AgeingRow; label: string; hue: 'green' | 'red' }[] = [
  { key: 'current', label: 'Current', hue: 'green' },
  { key: 'd30', label: '1–30 days', hue: 'red' },
  { key: 'd60', label: '31–60 days', hue: 'red' },
  { key: 'd90', label: '60+ days', hue: 'red' },
];

const RGB = { green: '47,125,79', red: '192,57,43' };

export default function CollectionsHeatmap({ rows }: { rows: AgeingRow[] }) {
  if (!rows.length) return <p className="card-pad muted">Nothing outstanding — all collected.</p>;
  // Column-wise max drives the intensity scale within each ageing bucket.
  const max: Record<string, number> = {};
  for (const c of COLS) max[c.key] = Math.max(1, ...rows.map((r) => Number(r[c.key])));

  return (
    <div className="table-wrap">
      <table className="heatmap">
        <thead>
          <tr><th>Customer</th>{COLS.map((c) => <th key={c.key} className="num">{c.label}</th>)}<th className="num">Total</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const total = COLS.reduce((s, c) => s + Number(r[c.key]), 0);
            return (
              <tr key={r.customer_id}>
                <td><Link href={`/sales/customers/${r.customer_id}`} className="cell-main" style={{ color: 'var(--copper-text)' }}>{r.customer}</Link></td>
                {COLS.map((c) => {
                  const amt = Number(r[c.key]);
                  const a = amt > 0 ? (0.12 + 0.68 * (amt / max[c.key])).toFixed(2) : '0';
                  return (
                    <td key={c.key} className="hm-cell num" title={amt > 0 ? `${r.customer} · ${c.label}: ${inrFull(amt)}` : ''}
                      style={amt > 0 ? { background: `rgba(${RGB[c.hue]},${a})`, color: c.hue === 'red' ? '#7a241b' : '#1f5a38', fontWeight: 700 } : undefined}>
                      {amt > 0 ? inr(amt) : <span className="muted">—</span>}
                    </td>
                  );
                })}
                <td className="num"><b>{inr(total)}</b></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
