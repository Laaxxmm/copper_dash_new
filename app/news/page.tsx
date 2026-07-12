import { PageHead } from '@/components/ui';
import AutoRefresh from '@/components/AutoRefresh';
import { copperNews, liveMarket, timeAgo } from '@/lib/market';
import { cspToday } from '@/lib/queries';
import { inrFull, perKg } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function NewsPage() {
  const [news, market] = await Promise.all([copperNews(20), liveMarket()]);
  const csp = cspToday();

  return (
    <>
      <AutoRefresh seconds={180} />
      <PageHead
        title="Market & news"
        sub="Live world copper price and the latest headlines — check here before fixing a rate or placing a booking."
      />

      <div className="grid tiles">
        <div className="card tile accent">
          <div className="t-label">World copper (COMEX), live</div>
          <div className="t-value">{market ? `$${market.copperUsdLb.toFixed(2)}/lb` : '—'}</div>
          <div className="t-note">
            {market
              ? market.copperChangePct != null
                ? <span className={market.copperChangePct >= 0 ? 'pos' : 'neg'}>
                    {market.copperChangePct >= 0 ? '▲' : '▼'} {Math.abs(market.copperChangePct).toFixed(2)}% vs yesterday
                  </span>
                : 'live'
              : 'Live feed unreachable right now'}
          </div>
        </div>
        <div className="card tile">
          <div className="t-label">Dollar rate</div>
          <div className="t-value">{market ? `₹${market.usdInr.toFixed(2)}` : '—'}</div>
          <div className="t-note">USD / INR, live</div>
        </div>
        <div className="card tile">
          <div className="t-label">World price in ₹ (indication)</div>
          <div className="t-value">{market ? perKg(market.indicativeInrMt) : '—'}</div>
          <div className="t-note">{market ? `${inrFull(market.indicativeInrMt)} per MT, before premium & duty` : ''}</div>
        </div>
        <div className="card tile">
          <div className="t-label">Your saved price</div>
          <div className="t-value">{perKg(csp.price)}</div>
          <div className="t-note">Producer rate you entered · compare with the live world price</div>
        </div>
      </div>

      <div className="card section-gap">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="card-title">Copper headlines — live</div>
        </div>
        {news.length === 0 ? (
          <p className="muted" style={{ padding: '14px 20px 20px' }}>
            News feed unreachable right now — it comes back automatically when the internet connection allows.
          </p>
        ) : (
          <div className="news-list">
            {news.map((n, i) => (
              <a key={i} href={n.link} target="_blank" rel="noreferrer" className="news-item">
                <span className="news-dot" />
                <span>
                  <div className="news-title">{n.title}</div>
                  <div className="news-meta">{n.source}{n.pubDate ? ` · ${timeAgo(n.pubDate)}` : ''}</div>
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="help">
        <b>How to use this page:</b> the world price moves first; the producer price follows it. If the world price is
        falling, wait before fixing a purchase rate; if it is rising, fix your open “price later” quantities early.
        Headlines open the full story in a new tab. Prices refresh themselves every few minutes.
      </div>
    </>
  );
}
