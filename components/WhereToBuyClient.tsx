'use client';

// The flagship page: which supplier gives the best margin today.
// All interaction is client-side: steppers re-compute every card live.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { BuyOption } from '@/lib/queries';

const GOOD = 'var(--good)', BAD = 'var(--bad)';

const fmtInr = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

/** Smoothed sparkline path (Catmull-Rom → cubic Bézier), hand-drawn SVG per PRD. */
function sparkPath(values: number[], w: number, h: number, pad = 3): { line: string; area: string } {
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (w - pad * 2),
    pad + (1 - (v - min) / span) * (h - pad * 2),
  ]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return { line: d, area: `${d} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z` };
}

function Sparkline({ history, falling }: { history: number[]; falling: boolean }) {
  const kg = history.map((v) => v / 1000);
  const { line, area } = sparkPath(kg, 120, 38);
  const color = falling ? GOOD : BAD;
  return (
    <svg width="120" height="38" viewBox="0 0 120 38" aria-hidden>
      <path d={area} fill={color} opacity="0.1" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Chip({ tone, children }: { tone: 'good' | 'ok' | 'bad'; children: React.ReactNode }) {
  return <span className={`chip c-${tone}`}><span className="cdot" />{children}</span>;
}

const ONTIME_LABEL = { good: 'On-time', ok: 'Sometimes late', bad: 'Often late' } as const;
const WEIGHT_LABEL = { good: 'Weight matches', ok: 'Small weight cuts', bad: 'Weight cuts' } as const;
const RELIABILITY = { good: 2, ok: 1, bad: 0 } as const;

type SortKey = 'margin' | 'credit' | 'reliable';

export default function WhereToBuyClient({ suppliers, marketKg, sellDefaultKg }: {
  suppliers: BuyOption[]; marketKg: number; sellDefaultKg: number;
}) {
  const [qty, setQty] = useState(5);
  const [sell, setSell] = useState(Math.round(sellDefaultKg));
  const [sort, setSort] = useState<SortKey>('margin');

  const rows = useMemo(() => {
    const withMargin = suppliers.map((s) => {
      const rateKg = s.rate_mt / 1000;
      const marginKg = sell - rateKg;
      return { ...s, rateKg, marginKg, reliability: RELIABILITY[s.ontime] + RELIABILITY[s.weight] };
    });
    const byMargin = (a: typeof withMargin[0], b: typeof withMargin[0]) => b.marginKg - a.marginKg;
    if (sort === 'credit') return withMargin.sort((a, b) => b.credit_days - a.credit_days || byMargin(a, b));
    if (sort === 'reliable') return withMargin.sort((a, b) => b.reliability - a.reliability || byMargin(a, b));
    return withMargin.sort(byMargin);
  }, [suppliers, sell, sort]);

  const best = useMemo(() => [...rows].sort((a, b) => b.marginKg - a.marginKg)[0], [rows]);
  const cheapest = useMemo(() => Math.min(...rows.map((r) => r.rateKg)), [rows]);
  const maxMargin = Math.max(...rows.map((r) => r.marginKg), 0.001);

  const earn = (marginKg: number) => marginKg * qty * 1000;
  const cost = (rateKg: number) => rateKg * qty * 1000;

  return (
    <>
      <div className="card card-pad buy-controls">
        <div>
          <div className="step-label">How much do you want to buy?</div>
          <div className="stepper">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="less quantity">−</button>
            <span className="step-val">{qty} MT</span>
            <button onClick={() => setQty((q) => Math.min(25, q + 1))} aria-label="more quantity">+</button>
          </div>
        </div>
        <div>
          <div className="step-label">You can sell at</div>
          <div className="stepper">
            <button onClick={() => setSell((s) => Math.max(860, s - 1))} aria-label="lower sell price">−</button>
            <span className="step-val">₹{sell}</span>
            <button onClick={() => setSell((s) => Math.min(915, s + 1))} aria-label="higher sell price">+</button>
          </div>
          <div className="step-note">per kg · today&apos;s market ≈ ₹{marketKg.toFixed(0)}</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <div className="step-label" style={{ marginBottom: 8 }}>Rank by</div>
          <div className="pills" style={{ marginBottom: 0 }}>
            {([['margin', 'Best margin'], ['credit', 'Longest credit'], ['reliable', 'Most reliable']] as const).map(([k, label]) => (
              <button key={k} className={`pill${sort === k ? ' on' : ''}`} onClick={() => setSort(k)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {best && (
        <div className="card hero section-gap" style={{ padding: '22px 26px', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="card-title">Today&apos;s best buy</div>
            <div style={{ fontFamily: 'var(--font-display), serif', fontSize: 32, fontWeight: 600, lineHeight: 1.15 }}>{best.name}</div>
            <p style={{ color: 'var(--ink-2)', margin: '6px 0 10px', fontSize: 14.5 }}>
              Sells to you at ₹{best.rateKg.toFixed(1)}/kg — you keep{' '}
              <b style={{ color: best.marginKg >= 0 ? GOOD : BAD }}>₹{best.marginKg.toFixed(1)}/kg</b>
            </p>
            <div className="chips">
              {best.rateKg === cheapest && <span className="chip terms-adv">Cheapest rate</span>}
              <span className="chip terms-adv">{best.credit_days === 0 ? 'Advance pay' : `${best.credit_days}-day credit`}</span>
              {best.weight === 'good' && <span className="chip terms-adv">Weight always matches</span>}
              {best.trend_wk_mt < 0 && <span className="chip terms-adv">▼ rate falling</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>If you buy {qty} MT here</div>
            <div style={{ fontFamily: 'var(--font-display), serif', fontSize: 30, fontWeight: 600, color: best.marginKg >= 0 ? GOOD : BAD }}>
              {best.marginKg >= 0 ? '+' : ''}{fmtInr(earn(best.marginKg))} {best.marginKg >= 0 ? 'profit' : 'loss'}
            </div>
            <div className="step-note">costs {fmtInr(cost(best.rateKg))}</div>
            <Link href="/add?what=booking" className="btn-order">Place order →</Link>
          </div>
        </div>
      )}

      <div className="grid section-gap" style={{ gap: 14 }}>
        {rows.map((s, i) => {
          const loss = s.marginKg < 0;
          const isBest = s.id === best?.id;
          const falling = s.trend_wk_mt < 0;
          return (
            <div key={s.id} className="card buy-card">
              {isBest && <span className="ribbon">BEST MARGIN</span>}
              <div className={`rank-circle${isBest ? ' best' : ''}`}>{i + 1}</div>

              <div>
                <div className="buy-name">{s.name}</div>
                <div className="buy-meta">{[s.city, s.contact_person, s.phone].filter(Boolean).join(' · ')}</div>
                <div className="chips">
                  <span className={`chip ${s.credit_days === 0 ? 'terms-adv' : 'terms-credit'}`}>
                    {s.credit_days === 0 ? 'Advance pay' : `${s.credit_days}-day credit`}
                  </span>
                  <Chip tone={s.ontime}>{ONTIME_LABEL[s.ontime]}</Chip>
                  <Chip tone={s.weight}>{WEIGHT_LABEL[s.weight]}</Chip>
                </div>
              </div>

              <div>
                <Sparkline history={s.history_mt} falling={falling} />
                <div className="spark-cap" style={{ color: falling ? GOOD : BAD }}>
                  {falling ? '▼' : '▲'} ₹{Math.abs(s.trend_wk_mt / 1000).toFixed(1)} /wk
                </div>
              </div>

              <div>
                <div className="m-label" style={loss ? { color: BAD } : undefined}>{loss ? "You'd lose" : 'You keep'}</div>
                <div className="m-big" style={{ color: loss ? BAD : GOOD }}>₹{Math.abs(s.marginKg).toFixed(1)}/kg</div>
                <div className="m-bar">
                  <span style={{
                    width: `${loss ? 100 : Math.max(4, Math.round((s.marginKg / maxMargin) * 100))}%`,
                    background: loss ? BAD : GOOD,
                  }} />
                </div>
                <div className="step-note">buys at ₹{s.rateKg.toFixed(1)}/kg</div>
              </div>

              <div className="earn-block">
                <div className="step-note">On {qty} MT · costs {fmtInr(cost(s.rateKg))}</div>
                <div className="m-label" style={{ marginTop: 4 }}>{loss ? "you'd lose" : 'you earn'}</div>
                <div className="m-big" style={{ color: loss ? BAD : GOOD }}>{fmtInr(Math.abs(earn(s.marginKg)))}</div>
                {loss
                  ? <span className="btn-order skip">Skip</span>
                  : <Link href="/add?what=booking" className={`btn-order${isBest ? '' : ' outline'}`}>Order</Link>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="help">
        <b>How to read this:</b> margin = what you sell at minus what they charge. A lower buying rate means you keep
        more per kilo — the green bar. The little line is their rate over the last 8 weeks; falling (green) means they
        are getting cheaper. A red bar means their rate is above your selling price — you would lose money, skip them.
        Longer credit lets you pay later. Chase the top of the list.
      </div>
    </>
  );
}
