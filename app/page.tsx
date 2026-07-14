import Link from 'next/link';
import { PageHead, Tile } from '@/components/ui';
import AutoRefresh from '@/components/AutoRefresh';
import { monthlyPlan, costOfPurchase, unpricedExposure, supplierScorecard } from '@/lib/queries';
import { copperNews, timeAgo, westmetallLme } from '@/lib/market';
import { lmeStrip } from '@/lib/pricing';
import { mt, inr, monthLabel, today } from '@/lib/format';

export const dynamic = 'force-dynamic';

function pct(n: number, d: number) {
  return d > 0 ? Math.min(100, Math.round((n / d) * 100)) : 0;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month = today().slice(0, 7) } = await searchParams;
  const [liveLme, headlines] = await Promise.all([westmetallLme(), copperNews(3)]);
  const strip = lmeStrip(liveLme?.usd_mt);
  const plan = monthlyPlan(month);
  const cost = costOfPurchase(month);
  const exposureQty = unpricedExposure().reduce((s, e) => s + e.qty_open, 0);
  const scores = supplierScorecard();

  const totTarget = plan.reduce((s, r) => s + r.target_mt, 0);
  const totLifted = plan.reduce((s, r) => s + r.lifted_mt, 0);

  return (
    <>
      <AutoRefresh seconds={120} />
      <PageHead title="Dashboard" sub="This month's plan against what's actually moving — targets, lifting, cost and risk." />

      <form className="month-pick" method="get">
        <label>Month <input type="month" name="month" defaultValue={month} /></label>
        <button className="btn-sm" type="submit">View</button>
        <span className="month-now">{monthLabel(month)}</span>
      </form>

      <Link href="/news" className="market-strip card">
        <span className="ms-item">
          <span className="ms-label">LME copper · cash {strip?.live ? '· live' : ''}</span>
          <span className="ms-value">
            {strip ? `$${Math.round(strip.usd_mt).toLocaleString('en-US')}/MT` : 'no LME yet'}
            {strip?.changePct != null && (
              <em className={strip.changePct >= 0 ? 'pos' : 'neg'}>
                {' '}{strip.changePct >= 0 ? '▲' : '▼'}{Math.abs(strip.changePct).toFixed(1)}%
              </em>
            )}
          </span>
        </span>
        <span className="ms-item">
          <span className="ms-label">In rupees (indication)</span>
          <span className="ms-value">{strip ? `₹${strip.inrPerKg.toFixed(1)}/kg` : '—'}</span>
        </span>
        <span className="ms-item">
          <span className="ms-label">Dollar · RBI TT</span>
          <span className="ms-value">{strip ? `₹${strip.fx.toFixed(2)}` : '—'}</span>
        </span>
        <span className="ms-news">
          <span className="ms-label">Latest news</span>
          <span className="ms-headline">
            {headlines[0] ? <>{headlines[0].title} <em className="muted">· {timeAgo(headlines[0].pubDate)}</em></> : 'Open Market →'}
          </span>
        </span>
        <span className="ms-more">→</span>
      </Link>

      <div className="grid tiles">
        <Tile
          label="Cost of purchase"
          value={inr(cost.committed)}
          note={<><b>{inr(cost.paid)}</b> paid to suppliers this month{cost.poCount ? ` · ${cost.poCount} PO${cost.poCount > 1 ? 's' : ''}` : ''}</>}
          accent
        />
        <Tile
          label="Lifted vs target"
          value={`${mt(Math.round(totLifted * 10) / 10)}`}
          note={<>of <b>{mt(Math.round(totTarget * 10) / 10)}</b> planned · {pct(totLifted, totTarget)}% achieved</>}
        />
        <Tile
          label="Quantity without a price"
          value={mt(Math.round(exposureQty * 10) / 10)}
          tone={exposureQty > 5 ? 'warn' : undefined}
          note="Booked material whose rate isn't fixed — this moves with the market"
        />
      </div>

      <div className="section-gap">
        <div className="section-title">Suppliers this month — target vs lifted</div>
        {plan.length === 0 ? (
          <div className="card card-pad muted">
            No plan for {monthLabel(month)} yet. Set monthly targets per supplier on <Link href="/suppliers" style={{ fontWeight: 700 }}>Suppliers →</Link>
          </div>
        ) : (
          <div className="grid kpi-grid">
            {plan.map((r) => {
              const p = pct(r.lifted_mt, r.target_mt || r.agreed_mt);
              return (
                <Link key={r.supplier_id} href={`/suppliers/${r.supplier_id}`} className="card card-pad kpi-card">
                  <div className="kpi-head">
                    <span className="kpi-name">{r.supplier}</span>
                    <span className="rank-pill">{r.manual_rank ? `L${r.manual_rank}` : '—'}</span>
                  </div>
                  <div className="kpi-nums">
                    <span><b>{mt(r.target_mt)}</b><i>target</i></span>
                    <span><b>{mt(r.agreed_mt)}</b><i>agreed</i></span>
                    <span><b>{mt(Math.round(r.lifted_mt * 10) / 10)}</b><i>lifted</i></span>
                  </div>
                  <span className="pipe-bar" style={{ height: 8 }}>
                    <span className="pipe-fill" style={{ width: `${p}%`, background: p >= 100 ? 'var(--good)' : 'var(--copper)' }} />
                  </span>
                  <div className="kpi-foot">
                    <span>{p}% of {r.target_mt > 0 ? 'target' : 'agreed'}</span>
                    <span>{r.avg_cost_kg ? `avg ₹${r.avg_cost_kg.toFixed(1)}/kg` : 'no lift priced'}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="section-gap">
        <div className="section-title">Which supplier is better</div>
        <div className="card card-pad">
          {scores.length === 0 ? (
            <p className="muted">No supplier deals matched yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Supplier</th><th>Margin ₹/kg</th><th>Volume</th><th>On-time</th><th>Transit</th><th>Weight cut</th></tr>
                </thead>
                <tbody>
                  {scores.map((s) => (
                    <tr key={s.id}>
                      <td><Link href={`/suppliers/${s.id}`} className="cell-main" style={{ color: 'var(--copper-text)' }}>{s.name}</Link></td>
                      <td>{s.margin_mt != null ? `₹${(s.margin_mt / 1000).toFixed(1)}` : '—'}</td>
                      <td>{mt(Math.round(s.delivered_mt * 10) / 10)}</td>
                      <td>{s.ontime_pct != null ? `${s.ontime_pct}%` : '—'}</td>
                      <td>{s.avg_transit_days != null ? `${s.avg_transit_days.toFixed(1)} d` : '—'}</td>
                      <td>{s.short_kg > 0 ? `${Math.round(s.short_kg)} kg` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
