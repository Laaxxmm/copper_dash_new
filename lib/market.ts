// Live market data — no API keys. COMEX copper futures + USD/INR from Yahoo
// Finance's public chart endpoint; copper headlines from Google News RSS.
// Everything degrades gracefully: if a feed is unreachable, callers get null/[]
// and the UI falls back to the client's own saved price.

const FEED_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; CopperBook/1.0)' };

type Quote = { price: number; prevClose: number | null; time: number | null };

async function yahooQuote(symbol: string): Promise<Quote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const r = await fetch(url, { headers: FEED_HEADERS, next: { revalidate: 120 } });
    if (!r.ok) return null;
    const j = await r.json();
    const meta = j?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    if (!isFinite(price) || price <= 0) return null;
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
    return { price, prevClose: isFinite(prev) && prev > 0 ? prev : null, time: Number(meta?.regularMarketTime) || null };
  } catch {
    return null;
  }
}

export type LiveMarket = {
  copperUsdLb: number;
  copperChangePct: number | null;
  usdInr: number;
  /** COMEX price converted to ₹/MT — an indication, not the producer CSP */
  indicativeInrMt: number;
  asOf: string; // ISO time of the copper quote
};

const LB_PER_MT = 2204.62262;

export async function liveMarket(): Promise<LiveMarket | null> {
  const [hg, fx] = await Promise.all([yahooQuote('HG=F'), yahooQuote('INR=X')]);
  if (!hg || !fx) return null;
  return {
    copperUsdLb: hg.price,
    copperChangePct: hg.prevClose ? ((hg.price - hg.prevClose) / hg.prevClose) * 100 : null,
    usdInr: fx.price,
    indicativeInrMt: Math.round((hg.price * LB_PER_MT * fx.price) / 100) * 100,
    asOf: hg.time ? new Date(hg.time * 1000).toISOString() : new Date().toISOString(),
  };
}

export type LmeQuote = { usd_mt: number; source: 'westmetall'; asOf: string };

/** Live LME copper cash settlement (USD/MT) from westmetall's market-data page.
 *  Best-effort + graceful: returns null on any failure, so callers fall back to
 *  the last saved LME. A convenience feed, never an unattended source of truth. */
export async function westmetallLme(): Promise<LmeQuote | null> {
  try {
    const r = await fetch('https://www.westmetall.com/en/markdaten.php', { headers: FEED_HEADERS, next: { revalidate: 3600 } });
    if (!r.ok) return null;
    const text = (await r.text()).replace(/<[^>]+>/g, ' ');
    // The first "Copper <cash> <3-month>" row is LME Grade A. Range-check guards
    // against matching the smaller WM-Notiz / Wieland rows.
    for (const m of text.matchAll(/Copper\s+([\d.,]+)\s+[\d.,]+/g)) {
      const v = parseFloat(m[1].replace(/,/g, ''));
      if (v >= 3000 && v <= 40000) return { usd_mt: Math.round(v * 100) / 100, source: 'westmetall', asOf: new Date().toISOString() };
    }
    return null;
  } catch {
    return null;
  }
}

export type NewsItem = { title: string; link: string; source: string; pubDate: string };

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

export async function copperNews(limit = 14): Promise<NewsItem[]> {
  try {
    const q = encodeURIComponent('copper price OR "LME copper" OR "MCX copper" OR "copper cathode" OR Hindalco copper');
    const url = `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
    const r = await fetch(url, { headers: FEED_HEADERS, next: { revalidate: 300 } });
    if (!r.ok) return [];
    const xml = await r.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .slice(0, limit)
      .map((m) => {
        const x = m[1];
        const pick = (re: RegExp) => decodeEntities((x.match(re)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim());
        return {
          title: pick(/<title>([\s\S]*?)<\/title>/),
          link: pick(/<link>([\s\S]*?)<\/link>/),
          source: pick(/<source[^>]*>([\s\S]*?)<\/source>/),
          pubDate: pick(/<pubDate>([\s\S]*?)<\/pubDate>/),
        };
      })
      .filter((n) => n.title && n.link);
  } catch {
    return [];
  }
}

export function timeAgo(pubDate: string): string {
  const t = new Date(pubDate).getTime();
  if (!isFinite(t)) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}
