'use client';

// Product-aware supplier board (L1..Ln), fed by the real pricing engine.
// The buy rate for each supplier is recomputed live as you nudge the LME or the
// sell price, and the list re-ranks — cheapest is always L1.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ratePerKg } from '@/lib/formula';

type Product = { id: number; type: 'WIRE' | 'ROD'; size_mm: number; description: string };
type Row = {
  supplier_id: number; supplier: string; city: string | null; phone: string | null;
  premium_usd_mt: number; transaction_usd_mt: number; factor_pct: number; handling_inr_mt: number;
  exchange_basis: string; exchange_rate: number; delivery_days: number | null; credit_days: number | null;
};

const GOOD = 'var(--good)', BAD = 'var(--bad)';

export default function BuyBoardClient({ products, productId, rows, lme, source, asOf, defaultSellKg }: {
  products: Product[]; productId: number; rows: Row[];
  lme: number; source: string; asOf: string; defaultSellKg: number;
}) {
  const router = useRouter();
  const [lmeUsd, setLme] = useState(Math.round(lme));
  const [sell, setSell] = useState(Math.round(defaultSellKg * 10) / 10);

  const ranked = useMemo(() => {
    return rows
      .map((r) => {
        const rate = ratePerKg({
          lme_usd_mt: lmeUsd, premium_usd_mt: r.premium_usd_mt, transaction_usd_mt: r.transaction_usd_mt,
          factor_pct: r.factor_pct, exchange_rate: r.exchange_rate, handling_inr_mt: r.handling_inr_mt,
        });
        return { ...r, rate, margin: Math.round((sell - rate) * 100) / 100 };
      })
      .sort((a, b) => a.rate - b.rate)
      .map((r, i) => ({ ...r, tier: `L${i + 1}` }));
  }, [rows, lmeUsd, sell]);

  const best = ranked[0];
  const maxMargin = Math.max(...ranked.map((r) => Math.abs(r.margin)), 0.01);
  const product = products.find((p) => p.id === productId);

  return (
    <>
      <div className="card card-pad buy-controls">
        <div>
          <div className="step-label">Which product?</div>
          <select
            value={productId}
            onChange={(e) => router.push(`/where-to-buy?product=${e.target.value}`)}
            style={{ fontSize: 15, padding: '11px 12px', borderRadius: 12, border: '1px solid var(--pill-line)', background: 'var(--input)', minHeight: 44, minWidth: 200 }}
          >
            <optgroup label="Wire (< 6 mm)">
              {products.filter((p) => p.type === 'WIRE').map((p) => <option key={p.id} value={p.id}>{p.description}</option>)}
            </optgroup>
            <optgroup label="Rod">
              {products.filter((p) => p.type === 'ROD').map((p) => <option key={p.id} value={p.id}>{p.description}</option>)}
            </optgroup>
          </select>
        </div>
        <div>
          <div className="step-label">LME copper (USD / MT)</div>
          <div className="stepper">
            <button onClick={() => setLme((v) => v - 50)} aria-label="lower LME">−</button>
            <span className="step-val">${lmeUsd.toLocaleString('en-US')}</span>
            <button onClick={() => setLme((v) => v + 50)} aria-label="raise LME">+</button>
          </div>
          <div className="step-note">saved {asOf} · {source}</div>
        </div>
        <div>
          <div className="step-label">You can sell at (₹ / kg)</div>
          <div className="stepper">
            <button onClick={() => setSell((v) => Math.round((v - 1) * 10) / 10)} aria-label="lower sell">−</button>
            <span className="step-val">₹{sell.toFixed(1)}</span>
            <button onClick={() => setSell((v) => Math.round((v + 1) * 10) / 10)} aria-label="raise sell">+</button>
          </div>
        </div>
      </div>

      {best && (
        <div className="card hero section-gap" style={{ padding: '22px 26px', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="card-title">Today&apos;s best buy · {product?.description}</div>
            <div style={{ fontFamily: 'var(--font-display), serif', fontSize: 30, fontWeight: 600, lineHeight: 1.15 }}>{best.supplier}</div>
            <p style={{ color: 'var(--ink-2)', margin: '6px 0 10px', fontSize: 14.5 }}>
              Buys at <b>₹{best.rate.toFixed(2)}/kg</b> — you keep{' '}
              <b style={{ color: best.margin >= 0 ? GOOD : BAD }}>₹{best.margin.toFixed(2)}/kg</b>
            </p>
            <div className="chips">
              <span className="chip terms-adv">Cheapest (L1)</span>
              <span className="chip terms-credit">{best.credit_days ? `${best.credit_days}-day credit` : 'Advance pay'}</span>
              {best.delivery_days != null && <span className="chip terms-credit">{best.delivery_days}-day delivery</span>}
              <span className="chip terms-credit">{best.exchange_basis === 'SBI_TT' ? 'SBI TT' : 'RBI TT'}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>At LME ${lmeUsd.toLocaleString('en-US')}/MT</div>
            <div style={{ fontFamily: 'var(--font-display), serif', fontSize: 30, fontWeight: 600, color: best.margin >= 0 ? GOOD : BAD }}>
              {best.margin >= 0 ? '+' : ''}₹{best.margin.toFixed(2)}/kg {best.margin >= 0 ? 'margin' : 'loss'}
            </div>
            <Link href="/add?what=booking" className="btn-order">Place order →</Link>
          </div>
        </div>
      )}

      <div className="card table-wrap section-gap">
        <table className="data">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Supplier</th>
              <th className="num">Buy rate ₹/kg</th>
              <th className="num">You keep ₹/kg</th>
              <th>Cost build-up (per MT)</th>
              <th className="num">Delivery</th>
              <th className="num">Credit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => {
              const loss = r.margin < 0;
              return (
                <tr key={r.supplier_id}>
                  <td><span className={`rank-circle${r.tier === 'L1' ? ' best' : ''}`} style={{ width: 30, height: 30, fontSize: 13 }}>{r.tier}</span></td>
                  <td>
                    <Link href={`/parties/${r.supplier_id}`} className="cell-main" style={{ color: 'var(--copper-text)' }}>{r.supplier}</Link>
                    <div className="cell-sub">{[r.city, r.exchange_basis === 'SBI_TT' ? 'SBI TT' : 'RBI TT'].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="num"><b>₹{r.rate.toFixed(2)}</b></td>
                  <td className="num">
                    <b className={loss ? 'neg' : 'pos'}>{loss ? '−' : ''}₹{Math.abs(r.margin).toFixed(2)}</b>
                    <div className="m-bar" style={{ marginLeft: 'auto', maxWidth: 120 }}>
                      <span style={{ width: `${loss ? 100 : Math.max(4, Math.round((r.margin / maxMargin) * 100))}%`, background: loss ? BAD : GOOD }} />
                    </div>
                  </td>
                  <td className="cell-sub" style={{ fontSize: 12 }}>
                    LME ${lmeUsd.toLocaleString('en-US')} + prem ${r.premium_usd_mt} + txn ${r.transaction_usd_mt} · ×{(1 + r.factor_pct / 100).toFixed(4)} · +₹{r.handling_inr_mt} hdl
                  </td>
                  <td className="num">{r.delivery_days != null ? `${r.delivery_days} d` : '—'}</td>
                  <td className="num">{r.credit_days ? `${r.credit_days} d` : 'Advance'}</td>
                  <td>{loss ? <span className="btn-order skip">Skip</span> : <Link href="/add?what=booking" className={`btn-order${r.tier === 'L1' ? '' : ' outline'}`}>Order</Link>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="help">
        <b>How to read this:</b> each supplier&apos;s buy rate is your real formula — LME plus their premium, factor,
        exchange (RBI/SBI TT) and handling — for the exact product above. <b>L1 is cheapest today.</b> Nudge the LME
        or your sell price and the whole board re-ranks. A red &quot;you keep&quot; means their rate is above your sell
        price — skip. Delivery and credit come from each supplier&apos;s terms, so a cheap supplier who delivers slow or
        gives no credit may not be the real L1 for you.
      </div>
    </>
  );
}
