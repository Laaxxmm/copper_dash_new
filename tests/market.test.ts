import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearFeedCache, copperNews, liveMarket, timeAgo } from '@/lib/market';

const yahooBody = (price: number, prev: number) => ({
  chart: { result: [{ meta: { regularMarketPrice: price, chartPreviousClose: prev, regularMarketTime: 1783774373 } }] },
});

const jsonResponse = (body: unknown) => ({ ok: true, json: async () => body, text: async () => '' });

afterEach(() => { vi.unstubAllGlobals(); clearFeedCache(); });

describe('liveMarket', () => {
  it('converts COMEX $/lb into an indicative ₹/MT', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('HG%3DF') ? jsonResponse(yahooBody(6, 5.9)) : jsonResponse(yahooBody(95, 95))));
    const m = await liveMarket();
    expect(m).not.toBeNull();
    expect(m!.copperUsdLb).toBe(6);
    expect(m!.usdInr).toBe(95);
    // 6 $/lb × 2204.62262 lb/MT × ₹95, rounded to the nearest ₹100
    expect(m!.indicativeInrMt).toBe(Math.round((6 * 2204.62262 * 95) / 100) * 100);
    expect(m!.copperChangePct).toBeCloseTo(((6 - 5.9) / 5.9) * 100, 5);
  });

  it('returns null when a feed is down instead of breaking the page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    expect(await liveMarket()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await liveMarket()).toBeNull();
  });
});

describe('copperNews', () => {
  const XML = `<rss><channel>
    <item><title><![CDATA[Copper rallies on supply squeeze]]></title>
      <link>https://example.com/a</link>
      <pubDate>Fri, 10 Jul 2026 08:00:00 GMT</pubDate>
      <source url="https://example.com">Mining Daily</source></item>
    <item><title>LME copper &amp; premiums retreat</title>
      <link>https://example.com/b</link>
      <pubDate>Thu, 09 Jul 2026 08:00:00 GMT</pubDate>
      <source>Metal Wire</source></item>
  </channel></rss>`;

  it('parses titles, links, sources and decodes entities/CDATA', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => XML })));
    const items = await copperNews();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: 'Copper rallies on supply squeeze', source: 'Mining Daily' });
    expect(items[1].title).toBe('LME copper & premiums retreat');
  });

  it('returns an empty list when the feed is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await copperNews()).toEqual([]);
  });

  it('falls back to Bing when Google returns nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      text: async () => url.includes('news.google.com')
        ? '<rss><channel></channel></rss>'
        : '<rss><channel><item><title>Copper climbs</title><link>https://example.com/c</link><pubDate>Fri, 10 Jul 2026 08:00:00 GMT</pubDate></item></channel></rss>',
    })));
    const items = await copperNews();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'Copper climbs', source: 'Bing News' });
  });
});

describe('feed cache', () => {
  it('keeps serving the last good value when the feed later fails (stale-on-error)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('HG%3DF') ? jsonResponse(yahooBody(6, 5.9)) : jsonResponse(yahooBody(95, 95))));
    expect((await liveMarket())!.copperUsdLb).toBe(6);
    vi.advanceTimersByTime(121_000); // past the TTL → refresh attempt
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const m = await liveMarket();
    expect(m).not.toBeNull(); // stale value survives the outage
    expect(m!.copperUsdLb).toBe(6);
    vi.useRealTimers();
  });
});

describe('timeAgo', () => {
  it('renders human deltas and tolerates junk', () => {
    expect(timeAgo(new Date(Date.now() - 30 * 60000).toISOString())).toBe('30 min ago');
    expect(timeAgo(new Date(Date.now() - 3 * 3600000).toISOString())).toBe('3 hr ago');
    expect(timeAgo(new Date(Date.now() - 48 * 3600000).toISOString())).toBe('2 days ago');
    expect(timeAgo('not a date')).toBe('');
  });
});
