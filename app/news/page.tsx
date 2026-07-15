import { withTenantPage, resolveSession } from '@/lib/tenant-resolve';
import { DEFAULT_SETTINGS } from '@/lib/control-db';
import { PageHead } from '@/components/ui';
import AutoRefresh from '@/components/AutoRefresh';
import { copperNews, liveLme, liveMarket, timeAgo } from '@/lib/market';
import { lmeStrip } from '@/lib/pricing';
import { cspToday } from '@/lib/queries';
import { perKg } from '@/lib/format';

export const dynamic = 'force-dynamic';

async function NewsPage() {
  const [allNews, lq, comex] = await Promise.all([copperNews(20), liveLme(), liveMarket()]);
  const strip = lmeStrip(lq?.usd_mt);
  const csp = cspToday();
  const settings = (await resolveSession())?.settings ?? DEFAULT_SETTINGS;

  // Filter headlines to this client's keywords, if they set any.
  const keywords = settings.newsKeywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
  const matched = keywords.length ? allNews.filter((n) => keywords.some((k) => n.title.toLowerCase().includes(k))) : allNews;
  const news = matched.length ? matched : allNews;
  const filteredEmpty = keywords.length > 0 && matched.length === 0 && allNews.length > 0;

  return (
    <>
      <AutoRefresh seconds={180} />
      <PageHead
        title="Market & news"
        sub="Live LME copper — the same price the whole app builds its rates on — and the latest headlines. Check here before fixing a rate or booking."
      />

      <div className="grid tiles">
        <div className="card tile accent">
          <div className="t-label">LME copper · cash {strip?.live ? '· live' : '· last saved'}</div>
          <div className="t-value">{strip ? `$${Math.round(strip.usd_mt).toLocaleString('en-US')}/MT` : '—'}</div>
          <div className="t-note">
            {strip?.changePct != null
              ? <span className={strip.changePct >= 0 ? 'pos' : 'neg'}>{strip.changePct >= 0 ? '▲' : '▼'} {Math.abs(strip.changePct).toFixed(1)}%</span>
              : strip ? 'live from westmetall' : 'feed unreachable — using last saved'}
          </div>
        </div>
        <div className="card tile">
          <div className="t-label">In ₹/kg (indication)</div>
          <div className="t-value">{strip ? `₹${strip.inrPerKg.toFixed(1)}/kg` : '—'}</div>
          <div className="t-note">LME × exchange, before premium &amp; duty</div>
        </div>
        <div className="card tile">
          <div className="t-label">Dollar · RBI TT</div>
          <div className="t-value">{strip ? `₹${strip.fx.toFixed(2)}` : '—'}</div>
          <div className="t-note">the rate the pricing formula uses</div>
        </div>
        <div className="card tile">
          <div className="t-label">Your saved price</div>
          <div className="t-value">{perKg(csp.price)}</div>
          <div className="t-note">producer rate you entered · compare with LME</div>
        </div>
      </div>

      {comex ? (
        <p className="chart-note" style={{ marginTop: 10 }}>
          World reference · COMEX futures <b>${comex.copperUsdLb.toFixed(2)}/lb</b>
          {comex.copperChangePct != null ? ` (${comex.copperChangePct >= 0 ? '+' : ''}${comex.copperChangePct.toFixed(1)}% vs yesterday)` : ''}
          {' '}· market USD/INR ₹{comex.usdInr.toFixed(2)}. CopperBook prices against LME, not COMEX — this is just a cross-check.
        </p>
      ) : null}

      {settings.priceSource !== 'LME' ? (
        <p className="chart-note" style={{ marginTop: 6 }}>Your reference market is set to <b>{settings.priceSource}</b>. Rates are still computed on LME — this is the price you watch.</p>
      ) : null}

      <div className="card section-gap">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="card-title">Copper headlines — live</div>
          {keywords.length && !filteredEmpty ? <p className="muted" style={{ margin: '4px 0 0' }}>Filtered to: {keywords.join(', ')}</p> : null}
          {filteredEmpty ? <p className="muted" style={{ margin: '4px 0 0' }}>Nothing matched your keywords ({keywords.join(', ')}) — showing all copper headlines.</p> : null}
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

export default withTenantPage(NewsPage);
