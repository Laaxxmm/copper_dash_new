import { withTenantPage } from '@/lib/tenant-resolve';
import Link from 'next/link';
import { PageHead, Tile } from '@/components/ui';
import AutoRefresh from '@/components/AutoRefresh';
import PriorityHero from '@/components/PriorityHero';
import SupplierCarousel from '@/components/SupplierCarousel';
import { monthlyPlan, costOfPurchase, unpricedExposure, alerts, basisAlerts, profitability, customerProfitability, collectionsSummary } from '@/lib/queries';
import { copperNews, timeAgo, liveLme } from '@/lib/market';
import { lmeStrip } from '@/lib/pricing';
import { mt, inr, monthLabel, today } from '@/lib/format';

export const dynamic = 'force-dynamic';

function pct(n: number, d: number) {
  return d > 0 ? Math.min(100, Math.round((n / d) * 100)) : 0;
}

async function DashboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month = today().slice(0, 7) } = await searchParams;
  const [lq, headlines] = await Promise.all([liveLme(), copperNews(3)]);
  const strip = lmeStrip(lq?.usd_mt);
  const plan = monthlyPlan(month);
  const cost = costOfPurchase(month);
  const exposureQty = unpricedExposure().reduce((s, e) => s + e.qty_open, 0);

  const totTarget = plan.reduce((s, r) => s + r.target_mt, 0);
  const totLifted = plan.reduce((s, r) => s + r.lifted_mt, 0);
  const order = { critical: 0, warning: 1, info: 2 };
  const attention = [...basisAlerts(), ...alerts()].sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 8);
  const pnl = profitability(month);
  const topCustomers = customerProfitability(month).slice(0, 5);
  const collect = collectionsSummary();
  const hero = collect.overdue > 1
    ? { tone: 'urgent' as const, label: 'Overdue — collect now', amount: inr(collect.overdue), sub: `past the credit period · ${inr(collect.total)} due within the week across ${collect.count} bill${collect.count > 1 ? 's' : ''}.`, ctaHref: '/sales', ctaLabel: 'Review collections' }
    : collect.count > 0
      ? { tone: 'due' as const, label: 'To collect this week', amount: inr(collect.total), sub: `from ${collect.count} bill${collect.count > 1 ? 's' : ''} due within 7 days. Chase them before they slip overdue.`, ctaHref: '/sales', ctaLabel: 'Review collections' }
      : { tone: 'calm' as const, label: 'Nothing urgent today', amount: 'All clear', sub: 'No collections due this week. Keep the flow moving — set targets, send POs, log lifts.', ctaHref: '/sales', ctaLabel: 'Open Sales' };

  return (
    <>
      <AutoRefresh seconds={120} />
      <PageHead title="Dashboard" sub="The one thing that needs you today, then the month's numbers." />

      <PriorityHero {...hero} />

      <form className="month-pick" method="get">
        <label>Month <input type="month" name="month" defaultValue={month} /></label>
        <button className="btn-sm" type="submit">View</button>
        <span className="month-now">{monthLabel(month)}</span>
        <Link href="/po/new" className="btn-sm" style={{ marginLeft: 'auto' }}>Send a PO →</Link>
      </form>

      <Link href="/news" className="market-strip card">
        <span className="ms-item">
          <span className="ms-label">LME copper · cash {lq ? `· ${lq.source} · ${timeAgo(lq.asOf)}` : '· last saved'}</span>
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
          label="Net profit"
          value={inr(pnl.net)}
          tone={pnl.net < 0 ? 'bad' : 'good'}
          note={<>gross <b>{inr(pnl.grossMargin)}</b> − overheads <b>{inr(pnl.overheads)}</b></>}
        />
        <Tile
          label="Quantity without a price"
          value={mt(Math.round(exposureQty * 10) / 10)}
          tone={exposureQty > 5 ? 'warn' : undefined}
          note="Booked material whose rate isn't fixed — this moves with the market"
        />
      </div>

      {plan.length === 0 ? (
        <div className="section-gap">
          <div className="section-title">Suppliers this month — target vs lifted</div>
          <div className="card card-pad muted">
            No plan for {monthLabel(month)} yet. Set monthly targets per supplier on <Link href="/suppliers" style={{ fontWeight: 700 }}>Suppliers →</Link>
          </div>
        </div>
      ) : (
        <SupplierCarousel rows={plan} />
      )}

      {topCustomers.length > 0 && (
        <div className="section-gap">
          <div className="section-title">Profit by customer — {monthLabel(month)}</div>
          <div className="card">
            <div className="table-wrap">
              <table className="data compact">
                <thead><tr><th>Customer</th><th className="num">Revenue</th><th className="num">Margin</th><th className="num">Overhead</th><th className="num">Net</th></tr></thead>
                <tbody>
                  {topCustomers.map((c) => (
                    <tr key={c.customer_id}>
                      <td><Link href={`/sales/customers/${c.customer_id}`} className="cell-main" style={{ color: 'var(--copper-text)' }}>{c.customer}</Link></td>
                      <td className="num">{inr(c.revenue)}</td>
                      <td className="num">{inr(c.margin)}</td>
                      <td className="num muted">−{inr(c.overhead_share)}</td>
                      <td className="num" style={{ color: c.net < 0 ? 'var(--bad)' : 'var(--good)', fontWeight: 700 }}>{inr(c.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="chart-note" style={{ padding: '0 16px 14px' }}>Overheads shared by revenue. Full detail on <Link href="/finance" style={{ fontWeight: 700 }}>Finance →</Link></p>
          </div>
        </div>
      )}

      {attention.length > 0 && (
        <div className="section-gap">
          <div className="section-title">Needs your attention</div>
          <div className="card card-pad">
            <div className="alert-list">
              {attention.map((a, i) => (
                <Link href={a.href} key={i} className={`alert ${a.severity}`}>
                  <span className="a-dot" />
                  <span>
                    <div className="a-title">{a.title}</div>
                    <div className="a-detail">{a.detail}</div>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

    </>
  );
}

export default withTenantPage(DashboardPage);
