// Live market data — no API keys. COMEX copper futures + USD/INR from Yahoo
// Finance's public chart endpoint; copper headlines from Google News RSS.
// Everything degrades gracefully: if a feed is unreachable, callers get null/[]
// and the UI falls back to the client's own saved price.

const FEED_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; CopperBook/1.0)' };

// Our own tiny TTL cache instead of Next's fetch data-cache: deterministic on
// any host, and stale-on-error — if a refresh fails we keep serving the last
// good value and retry in 30s, so a flaky feed never freezes the app on a
// stale price or an empty news list.
type FeedEntry = { v: unknown; at: number };
const feeds = ((globalThis as typeof globalThis & { __cbFeeds?: Map<string, FeedEntry> }).__cbFeeds ??= new Map());
const RETRY_MS = 30_000;

/** Test hook: forget everything cached. */
export function clearFeedCache() { feeds.clear(); }

async function cachedFeed<T>(key: string, ttlMs: number, fn: () => Promise<T | null>): Promise<T | null> {
  const e = feeds.get(key);
  const now = Date.now();
  if (e && now - e.at < ttlMs) return e.v as T;
  const v = await fn().catch(() => null);
  const failed = v == null || (Array.isArray(v) && v.length === 0);
  if (!failed) {
    feeds.set(key, { v, at: now });
    return v;
  }
  if (e) { e.at = now - ttlMs + RETRY_MS; return e.v as T; } // serve stale, retry soon
  return v;
}

type Quote = { price: number; prevClose: number | null; time: number | null };

function yahooQuote(symbol: string): Promise<Quote | null> {
  return cachedFeed(`yq:${symbol}`, 120_000, async () => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const r = await fetch(url, { headers: FEED_HEADERS, cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    const meta = j?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    if (!isFinite(price) || price <= 0) return null;
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
    return { price, prevClose: isFinite(prev) && prev > 0 ? prev : null, time: Number(meta?.regularMarketTime) || null };
  });
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
export function westmetallLme(): Promise<LmeQuote | null> {
  return cachedFeed('wm', 120_000, async () => {
    const r = await fetch('https://www.westmetall.com/en/markdaten.php', { headers: FEED_HEADERS, cache: 'no-store' });
    if (!r.ok) return null;
    const text = (await r.text()).replace(/<[^>]+>/g, ' ');
    // The first "Copper <cash> <3-month>" row is LME Grade A. Range-check guards
    // against matching the smaller WM-Notiz / Wieland rows.
    for (const m of text.matchAll(/Copper\s+([\d.,]+)\s+[\d.,]+/g)) {
      const v = parseFloat(m[1].replace(/,/g, ''));
      if (v >= 3000 && v <= 40000) return { usd_mt: Math.round(v * 100) / 100, source: 'westmetall', asOf: new Date().toISOString() };
    }
    return null;
  });
}

/** COMEX copper (Yahoo HG=F, ¢/lb) → USD/MT, a live proxy when westmetall is down.
 *  It is NOT the LME cash settlement, so it's labelled 'comex' for the user. */
async function comexLme(): Promise<LmeQuote | null> {
  const hg = await yahooQuote('HG=F');
  if (!hg) return null;
  const usd_mt = Math.round((hg.price / 100) * LB_PER_MT * 100) / 100; // ¢/lb → $/lb → $/MT
  if (usd_mt < 3000 || usd_mt > 40000) return null;
  return { usd_mt, source: 'comex' as 'westmetall', asOf: hg.time ? new Date(hg.time * 1000).toISOString() : new Date().toISOString() };
}

/** Best available live LME: westmetall cash first, COMEX proxy as fallback.
 *  Returns the value with its source + timestamp so the UI can show provenance.
 *  null → the caller shows the last human-confirmed LME (the source of truth). */
export async function liveLme(): Promise<LmeQuote | null> {
  return (await westmetallLme()) ?? (await comexLme());
}

export type NewsItem = { title: string; link: string; source: string; pubDate: string };

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function parseRssItems(xml: string, fallbackSource: string): NewsItem[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((m) => {
      const x = m[1];
      const pick = (re: RegExp) => decodeEntities((x.match(re)?.[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim());
      return {
        title: pick(/<title>([\s\S]*?)<\/title>/),
        link: pick(/<link>([\s\S]*?)<\/link>/),
        source: pick(/<source[^>]*>([\s\S]*?)<\/source>/) || pick(/<News:Source>([\s\S]*?)<\/News:Source>/) || fallbackSource,
        pubDate: pick(/<pubDate>([\s\S]*?)<\/pubDate>/),
      };
    })
    .filter((n) => n.title && n.link);
}

async function fetchRss(url: string, fallbackSource: string): Promise<NewsItem[]> {
  const r = await fetch(url, { headers: FEED_HEADERS, cache: 'no-store' });
  if (!r.ok) return [];
  return parseRssItems(await r.text(), fallbackSource);
}

export async function copperNews(limit = 14): Promise<NewsItem[]> {
  // Google News first, Bing News as fallback — either source going dark (or
  // blocking the host's IP) no longer empties the page.
  const items = await cachedFeed<NewsItem[]>('news', 300_000, async () => {
    const q = encodeURIComponent('copper price OR "LME copper" OR "MCX copper" OR "copper cathode" OR India copper');
    const google = await fetchRss(`https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`, 'Google News').catch(() => []);
    if (google.length) return google.slice(0, 25);
    const bing = await fetchRss('https://www.bing.com/news/search?q=copper+price&format=rss', 'Bing News').catch(() => []);
    return bing.length ? bing.slice(0, 25) : null;
  });
  return (items ?? []).slice(0, limit);
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
