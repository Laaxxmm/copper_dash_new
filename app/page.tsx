import Link from 'next/link';
import { PageHead, Tile } from '@/components/ui';
import PriceChart from '@/components/charts/PriceChart';
import AutoRefresh from '@/components/AutoRefresh';
import { alerts, bookingsSummary, cspSeries, moneySummary, truckSummary, unpricedExposure } from '@/lib/queries';
import { copperNews, timeAgo, westmetallLme } from '@/lib/market';
import { lmeStrip } from '@/lib/pricing';
import { inr, mt } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const [liveLme, headlines] = await Promise.all([westmetallLme(), copperNews(3)]);
  const strip = lmeStrip(liveLme?.usd_mt);
  const money = moneySummary();
  const bookingSummary = bookingsSummary();
  const truckSummaryData = truckSummary();
  const exposure = unpricedExposure();
  const exposureQty = exposure.reduce((s, e) => s + e.qty_open, 0);
  const alertList = alerts();
  const prices = cspSeries(30);

  return (
    <>
      <AutoRefresh seconds={120} />
      <PageHead
        title="Today"
        sub="One look at the whole business: material, money and risk, right now."
      />

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
            {headlines[0] ? <>{headlines[0].title} <em className="muted">· {timeAgo(headlines[0].pubDate)}</em></> : 'Open the news tab →'}
          </span>
        </span>
        <span className="ms-more">→</span>
      </Link>

      <div className="grid tiles">
        <Tile
          label="To receive from customers"
          value={inr(money.receivable.total)}
          tone={money.receivable.overdue > 0 ? 'bad' : 'good'}
          note={money.receivable.overdue > 0
            ? <><b>{inr(money.receivable.overdue)}</b> is already late</>
            : 'Nothing overdue'}
          accent
        />
        <Tile
          label="To pay suppliers"
          value={inr(money.payable.total)}
          note={money.payable.due7 > 0 ? <><b>{inr(money.payable.due7)}</b> due within 7 days</> : 'Nothing due this week'}
        />
        <Tile
          label="Copper on the road"
          value={mt(truckSummaryData.inTransit.qty)}
          note={<>{truckSummaryData.inTransit.n} truck{truckSummaryData.inTransit.n === 1 ? '' : 's'} moving · {truckSummaryData.arrived.n} waiting to unload</>}
        />
        <Tile
          label="Quantity without a price"
          value={mt(exposureQty)}
          tone={exposureQty > 5 ? 'warn' : undefined}
          note="Booked material where the rate is not fixed yet — this moves with the market"
        />
      </div>

      <div className="grid two-col section-gap">
        <div className="card card-pad">
          <div className="card-title">Copper price — last 30 days (₹ per kg)</div>
          <PriceChart data={prices} />
          <p className="chart-note">
            Producer selling price. Every unpriced MT above gains or loses with this line.
          </p>
        </div>

        <div className="card card-pad">
          <div className="card-title">Needs your attention</div>
          {alertList.length === 0 ? (
            <p className="muted">All clear. No late payments, stuck trucks or open price risk.</p>
          ) : (
            <div className="alert-list">
              {alertList.map((a, i) => (
                <Link href={a.href} key={i} className={`alert ${a.severity}`}>
                  <span className="a-dot" />
                  <span>
                    <div className="a-title">{a.title}</div>
                    <div className="a-detail">{a.detail}</div>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid tiles section-gap">
        <Tile
          label="Open purchase bookings"
          value={mt(bookingSummary.openPurchaseQty)}
          note={<><b>{mt(bookingSummary.pendingLiftPurchase)}</b> still to be lifted from suppliers</>}
        />
        <Tile
          label="Open sale bookings"
          value={mt(bookingSummary.openSaleQty)}
          note={<><b>{mt(bookingSummary.pendingLiftSale)}</b> still to be sent to customers</>}
        />
        <Tile
          label="Weight cuts this season"
          value={`${Math.round(truckSummaryData.shortages.kg)} kg`}
          tone={truckSummaryData.shortages.kg > 400 ? 'warn' : undefined}
          note={<>{truckSummaryData.shortages.n} trips arrived lighter than the weighbridge slip</>}
        />
      </div>

      <div className="help">
        <b>How to read this page:</b> green and red money figures are what the business is owed and owes.
        “Quantity without a price” is copper already committed where the final rate is still open —
        if the market falls before you fix it, that becomes a loss. Click any alert to jump to the detail.
      </div>
    </>
  );
}
