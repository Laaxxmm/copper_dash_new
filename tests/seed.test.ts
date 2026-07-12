import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { destroyTestDb, useTestDb } from './helpers';
import { getDb, all } from '@/lib/db';
import { clearAllData, isEmpty, seedDemo } from '@/lib/seed';

const TABLES = ['parties', 'csp_prices', 'bookings', 'price_fixations', 'liftings', 'invoices', 'payments'];
const count = (t: string) => (all(`SELECT COUNT(*) c FROM ${t}`)[0] as { c: number }).c;

beforeAll(useTestDb);
afterAll(destroyTestDb);

describe('seed / erase', () => {
  it('starts empty', () => {
    expect(isEmpty(getDb())).toBe(true);
  });

  it('seedDemo fills every table with a coherent trade history', () => {
    seedDemo(getDb());
    expect(isEmpty(getDb())).toBe(false);
    for (const t of TABLES) expect(count(t)).toBeGreaterThan(0);
    // suppliers + customers = 11 parties, ~6 months of daily prices
    expect(count('parties')).toBe(11);
    expect(count('csp_prices')).toBeGreaterThan(150);
    // every payment points at a real invoice; every invoice at a real booking
    expect(all(`SELECT 1 FROM payments p LEFT JOIN invoices i ON i.id=p.invoice_id WHERE i.id IS NULL`)).toHaveLength(0);
    expect(all(`SELECT 1 FROM invoices i LEFT JOIN bookings b ON b.id=i.booking_id WHERE b.id IS NULL`)).toHaveLength(0);
  });

  it('clearAllData empties every table but keeps the schema', () => {
    clearAllData(getDb());
    for (const t of TABLES) expect(count(t)).toBe(0);
    expect(isEmpty(getDb())).toBe(true);
    // schema still usable — a fresh seed works again
    seedDemo(getDb());
    expect(count('parties')).toBe(11);
  });
});
