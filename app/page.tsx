import Link from 'next/link';
import { PageHead, Tile } from '@/components/ui';
import AutoRefresh from '@/components/AutoRefresh';
import { alerts, unpricedExposure } from '@/lib/queries';
import { requirements } from '@/lib/requirements';
import { copperNews, timeAgo, westmetallLme } from '@/lib/market';
import { lmeStrip } from '@/lib/pricing';
import { mt } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const [liveLme, headlines] = await Promise.all([westmetallLme(), copperNews(3)]);
  const strip = lmeStrip(liveLme?.usd_mt);
  const exposureQty = unpricedExposure().reduce((s, e) => s + e.qty_open, 0);
  const alertList = alerts();
  const reqs = requirements();
  const openReqs = reqs.filter((r) => r.status === 'OPEN' || r.status === 'PARTIAL');
  const toSource = Math.round(openReqs.reduce((s, r) => s + r.remaining, 0) * 10) / 10;

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
          label="Open requirements"
          value={String(openReqs.length)}
          note={<><b>{mt(toSource)}</b> still to source across them</>}
          accent
        />
        <Tile
          label="Quantity without a price"
          value={mt(exposureQty)}
          tone={exposureQty > 5 ? 'warn' : undefined}
          note="Booked material where the rate is not fixed yet — this moves with the market"
        />
        <Tile
          label="Live LME copper"
          value={strip ? `$${Math.round(strip.usd_mt).toLocaleString('en-US')}` : '—'}
          note={strip ? `₹${strip.inrPerKg.toFixed(1)}/kg indication · check Where to buy` : 'no LME yet'}
        />
      </div>

      <div className="grid two-col section-gap">
        <div className="card card-pad">
          <div className="card-title">Requirements in progress</div>
          {openReqs.length === 0 ? (
            <p className="muted">No open requirements. <Link href="/requirements/new" style={{ fontWeight: 700 }}>Create one →</Link></p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  {openReqs.slice(0, 6).map((r) => {
                    const pct = Math.min(100, Math.round((r.sourced / r.qty_mt) * 100));
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/requirements/${r.id}`} className="cell-main mono" style={{ color: 'var(--copper-text)' }}>{r.req_no}</Link>
                          <div className="cell-sub">{r.product_desc}</div>
                        </td>
                        <td style={{ minWidth: 150 }}>
                          <span className="pipe-bar" style={{ height: 8 }}>
                            <span className="pipe-fill" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--good)' : 'var(--copper)' }} />
                          </span>
                          <div className="cell-sub">{mt(r.sourced)} / {r.qty_mt} · {r.remaining > 0.01 ? <b>{mt(r.remaining)} to source</b> : 'sourced'}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card card-pad">
          <div className="card-title">Needs your attention</div>
          {alertList.length === 0 ? (
            <p className="muted">All clear. No open price risk or pending legs.</p>
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

      <div className="help">
        <b>The flow:</b> pick the cheapest supplier on <Link href="/where-to-buy" style={{ fontWeight: 700 }}>Where to buy</Link>,
        split a month&apos;s need across suppliers on <Link href="/requirements" style={{ fontWeight: 700 }}>Requirements</Link>,
        and send each an ordering slip. “Quantity without a price” is committed material whose rate isn&apos;t fixed — market risk until you book it.
      </div>
    </>
  );
}
