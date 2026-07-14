import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { destroyTestDb, seedFixtures, useTestDb, type Fixtures } from './helpers';
import {
  alerts, bookings, bookingsSummary, cspToday, customerProfit, dealMargins, dnplDeadline, invoices,
  moneySummary, monthlyTrade, partyLedger, partySummaries, receivableAging,
  supplierScorecard, truckSummary, trucks, typicalSellRate, unpricedExposure, whereToBuy,
} from '@/lib/queries';

let fx: Fixtures;

beforeAll(() => {
  useTestDb();
  fx = seedFixtures();
});
afterAll(destroyTestDb);

describe('price', () => {
  it('returns the latest price and day change', () => {
    const t = cspToday();
    expect(t.price).toBe(900000);
    expect(t.change).toBe(100);
  });

  it('suggests a selling rate of market + the usual sale premium', () => {
    // Sale premiums in the last 60 days: SB-001 (0) and SB-002 (1000) → avg 500
    expect(typicalSellRate()).toBe(900500);
  });
});

describe('bookings', () => {
  it('joins fixation, lifting and billing aggregates per booking', () => {
    const pb1 = bookings().find((b) => b.booking_no === 'PB-001')!;
    expect(pb1.fixed_qty).toBe(10);
    expect(pb1.avg_fixed_price).toBe(880000);
    expect(pb1.lifted_qty).toBe(6);
    expect(pb1.billed_amount).toBeGreaterThan(0);
    expect(pb1.party_name).toBe('Supplier A');
  });

  it('filters by kind, status and party', () => {
    expect(bookings('PURCHASE')).toHaveLength(2);
    expect(bookings(undefined, 'COMPLETED')).toHaveLength(2);
    expect(bookings(undefined, undefined, fx.c1)).toHaveLength(2);
    expect(bookings('SALE', 'OPEN')).toHaveLength(1);
  });

  it('summarises open quantities and pending lifting', () => {
    const s = bookingsSummary();
    expect(s.openPurchaseQty).toBe(15);           // PB-001 10 + PB-002 5
    expect(s.pendingLiftPurchase).toBe(8);        // (10-6) + (5-1)
    expect(s.openSaleQty).toBe(3);                // SB-002
    expect(s.pendingLiftSale).toBe(1);            // 3 - 2 on the road
  });

  it('reports unpriced quantity as exposure', () => {
    const rows = unpricedExposure();
    const total = rows.reduce((s, r) => s + r.qty_open, 0);
    expect(rows.map((r) => r.booking_no).sort()).toEqual(['PB-002', 'SB-002']);
    expect(total).toBe(8);
  });
});

describe('trucks', () => {
  it('counts by status and totals weight shortages over 10 kg', () => {
    const t = truckSummary();
    expect(t.inTransit).toMatchObject({ n: 1, qty: 2 });
    expect(t.arrived).toMatchObject({ n: 1, qty: 1 });
    expect(t.shortages.n).toBe(1);                // only the 50 kg cut counts
    expect(t.shortages.kg).toBe(50);
  });

  it('filters by status', () => {
    expect(trucks('ARRIVED')).toHaveLength(1);
    expect(trucks()).toHaveLength(5);
  });
});

describe('money', () => {
  it('computes receivable/payable, overdue and 7-day dues from payments', () => {
    const m = moneySummary();
    expect(m.receivable.total).toBe(fx.i2.total / 2 + fx.i3.total + fx.i4.total);
    expect(m.receivable.overdue).toBe(fx.i4.total);
    expect(m.receivable.due7).toBe(fx.i2.total / 2);
    expect(m.payable.total).toBe(0);              // supplier bill fully paid in advance
  });

  it('buckets receivable aging', () => {
    const buckets = Object.fromEntries(receivableAging().map((r) => [r.bucket, r.amount]));
    expect(buckets['Not yet due']).toBe(fx.i2.total / 2 + fx.i3.total);
    expect(buckets['Over 30 days late']).toBe(fx.i4.total);
    expect(buckets['1–15 days late']).toBeUndefined();
  });

  it('lists only unpaid invoices when asked', () => {
    expect(invoices('SALE', true)).toHaveLength(3);
    expect(invoices('PURCHASE', true)).toHaveLength(0);
  });
});

describe('profit', () => {
  it('computes matched-deal margins from both fixations', () => {
    const deals = dealMargins();
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({
      sale_no: 'SB-001', purchase_no: 'PB-001',
      customer: 'Customer X', supplier: 'Supplier A',
      qty: 5, margin_mt: 20000, margin_total: 100000,
    });
  });

  it('aggregates margin per customer', () => {
    expect(customerProfit()).toEqual([{ customer: 'Customer X', deals: 1, qty: 5, margin: 100000 }]);
  });

  it('totals monthly bought vs sold values before GST', () => {
    const rows = monthlyTrade();
    expect(rows.reduce((s, r) => s + r.bought, 0)).toBe(6 * 880000);
    expect(rows.reduce((s, r) => s + r.sold, 0)).toBe(5 * 900000 + 2 * 901000 + 2 * 890000);
  });
});

describe('supplier performance', () => {
  it('scores margin, punctuality and weight per supplier', () => {
    const s1 = supplierScorecard().find((s) => s.id === fx.s1)!;
    expect(s1.delivered_mt).toBe(6);
    expect(s1.margin_total).toBe(100000);
    expect(s1.margin_mt).toBe(20000);
    expect(s1.ontime_pct).toBe(100);              // dispatched before the lift-by date
    expect(s1.avg_transit_days).toBe(2);
    expect(s1.short_trips).toBe(1);
    expect(s1.short_kg).toBe(50);
  });

  it('builds where-to-buy options with an 8-week history and grades', () => {
    const rows = whereToBuy();
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.history_mt).toHaveLength(8);
      expect(r.rate_mt).toBeGreaterThan(800000);
    }
    const a = rows.find((r) => r.id === fx.s1)!;
    expect(a.ontime).toBe('good');
    expect(a.weight).toBe('bad');                 // every weighed trip arrived light
    const b = rows.find((r) => r.id === fx.s2)!;
    expect(b.weight).toBe('ok');                  // nothing weighed yet — unknown
  });
});

describe('parties', () => {
  it('summarises orders, billing and dues per party', () => {
    const c1 = partySummaries('CUSTOMER').find((p) => p.id === fx.c1)!;
    expect(c1.outstanding).toBe(fx.i2.total / 2 + fx.i4.total);
    expect(c1.overdue).toBe(fx.i4.total);
    expect(c1.billed_total).toBe(fx.i2.total + fx.i4.total);
    expect(c1.open_orders).toBe(0);
    const c2 = partySummaries('CUSTOMER').find((p) => p.id === fx.c2)!;
    expect(c2.open_orders).toBe(1);
  });

  it('produces a chronological ledger', () => {
    const rows = partyLedger(fx.c1);
    expect(rows).toHaveLength(3);                 // 2 bills + 1 payment
    expect(rows[0].type).toBe('INVOICE');         // oldest first
    const balance = rows.reduce((s, r) => s + (r.debit ?? 0) - (r.credit ?? 0), 0);
    expect(balance).toBe(fx.i2.total / 2 + fx.i4.total);
  });
});

describe('alerts', () => {
  it('flags late payers and unpriced lifted material', () => {
    const titles = alerts().map((a) => a.title);
    expect(titles.some((t) => t.includes('Customer X payment late by 65 days'))).toBe(true);
    expect(titles.some((t) => t.includes('SB-002: 3 MT lifted but price not fixed'))).toBe(true);
  });
});

describe('DNPL pricing deadline', () => {
  it('prices first-half lots by month-end, second-half lots by the 15th of next month', () => {
    expect(dnplDeadline('2026-07-03')).toBe('2026-07-31'); // 1st–15th → month end
    expect(dnplDeadline('2026-07-15')).toBe('2026-07-31'); // boundary stays first-half
    expect(dnplDeadline('2026-07-16')).toBe('2026-08-15'); // 16th → 15th next month
    expect(dnplDeadline('2026-12-20')).toBe('2027-01-15'); // year rollover
    expect(dnplDeadline('2026-02-10')).toBe('2026-02-28'); // short month end
  });
});
