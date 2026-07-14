import { PageHead } from '@/components/ui';
import { dealMarginsBasis } from '@/lib/queries';
import { mt, inr, BASIS_LABEL } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default function MarginsPage() {
  const deals = dealMarginsBasis();
  const realized = deals.reduce((s, d) => s + d.margin_kg * d.qty * 1000, 0);
  const mismatches = deals.filter((d) => d.mismatch);
  const losses = deals.filter((d) => d.loss);

  return (
    <>
      <PageHead title="Deal margins" sub="Every sale against the purchase it came from — the real margin, and whether the buy-vs-sell price basis helped or hurt." />

      <div className="grid tiles">
        <div className="card tile accent"><div className="t-label">Realized margin</div><div className="t-value">{inr(Math.round(realized))}</div><div className="t-note">{deals.length} matched deals</div></div>
        <div className="card tile"><div className="t-label">Basis mismatches</div><div className="t-value">{mismatches.length}</div><div className="t-note">bought on a different basis than sold</div></div>
        <div className={`card tile${losses.length ? ' t-bad' : ''}`}><div className="t-label">Deals at a loss</div><div className="t-value">{losses.length}</div><div className="t-note">sell rate below buy rate</div></div>
      </div>

      <div className="card section-gap">
        {deals.length === 0 ? (
          <p className="card-pad muted">No matched sale↔purchase deals yet. Link a sell order to its purchase lot when you issue a PI.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Sale</th><th>Customer ← Supplier</th><th>Qty</th><th>Buy (basis @ ₹/kg)</th><th>Sell (basis @ ₹/kg)</th><th className="num">Margin ₹/kg</th><th className="num">Basis effect</th><th></th></tr>
              </thead>
              <tbody>
                {deals.map((d, i) => (
                  <tr key={i}>
                    <td className="mono">{d.sale_no}</td>
                    <td>{d.customer} <span className="muted">← {d.supplier}</span></td>
                    <td>{mt(d.qty)}</td>
                    <td>{BASIS_LABEL[d.buy_basis] ?? d.buy_basis} @ ₹{d.buy_rate_kg.toFixed(1)}</td>
                    <td>{BASIS_LABEL[d.sell_basis] ?? d.sell_basis} @ ₹{d.sell_rate_kg.toFixed(1)}</td>
                    <td className="num" style={{ color: d.margin_kg < 0 ? 'var(--bad)' : 'var(--good)', fontWeight: 700 }}>₹{d.margin_kg.toFixed(1)}</td>
                    <td className="num" style={{ color: d.basis_effect_kg < 0 ? 'var(--bad)' : d.basis_effect_kg > 0 ? 'var(--good)' : 'var(--ink-3)' }}>
                      {d.mismatch ? `${d.basis_effect_kg >= 0 ? '+' : ''}₹${d.basis_effect_kg.toFixed(1)}` : '—'}
                    </td>
                    <td>{d.loss ? <span className="badge bad"><span className="dot" />loss</span> : d.mismatch && d.basis_effect_kg <= -5 ? <span className="badge warn"><span className="dot" />basis drag</span> : d.mismatch ? <span className="badge neutral"><span className="dot" />mismatch</span> : <span className="badge good"><span className="dot" />aligned</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="help">
        <b>Basis effect</b> is how much the timing gap moved the deal: a <b>+</b> means the basis you sold on carried a higher LME than the one you bought on (in your favour); a <b>−</b> (basis drag) means you sold on a cheaper-priced basis than you bought — the squeeze the trader watches for when buying month-average but selling day-price.
      </div>
    </>
  );
}
