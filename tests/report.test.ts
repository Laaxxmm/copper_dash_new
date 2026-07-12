import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { destroyTestDb, isoDaysAgo, seedFixtures, useTestDb, type Fixtures } from './helpers';
import { GET } from '@/app/api/report/route';

let fx: Fixtures;

beforeAll(() => {
  useTestDb();
  fx = seedFixtures();
});
afterAll(destroyTestDb);

async function workbook(query: string) {
  const res = await GET(new NextRequest(`http://localhost/api/report?${query}`));
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toContain('spreadsheetml');
  return XLSX.read(Buffer.from(await res.arrayBuffer()));
}

const rows = (wb: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]);

describe('/api/report', () => {
  it('exports everything as one workbook with five sheets', async () => {
    const wb = await workbook('type=all');
    expect(wb.SheetNames).toEqual(['Bookings', 'Bills', 'Payments', 'Trucks', 'Profit']);
    expect(rows(wb, 'Bookings')).toHaveLength(5);
    expect(rows(wb, 'Trucks')).toHaveLength(5);
    expect(rows(wb, 'Profit')).toHaveLength(1);
  });

  it('keeps amounts as numbers so Excel can total them', async () => {
    const wb = await workbook('type=bills');
    const bill = rows(wb, 'Bills').find((r) => r['Bill No'] === 'CB/1')!;
    expect(bill['Total (₹)']).toBe(fx.i2.total);
    expect(bill['Pending (₹)']).toBe(fx.i2.total / 2);
    expect(typeof bill['GST (₹)']).toBe('number');
  });

  it('filters by the selected period', async () => {
    const wb = await workbook(`type=payments&from=${isoDaysAgo(15)}&to=${isoDaysAgo(0)}`);
    expect(rows(wb, 'Payments')).toHaveLength(1);          // only the NEFT from 10 days ago
    const none = await workbook(`type=payments&from=2001-01-01&to=2001-12-31`);
    expect(rows(none, 'Payments')).toEqual([{ Note: 'No entries in this period' }]);
  });

  it('computes matched-deal profit in the export', async () => {
    const wb = await workbook('type=profit');
    expect(rows(wb, 'Profit')[0]).toMatchObject({
      'Sale Booking': 'SB-001',
      'Margin (₹/MT)': 20000,
      'Margin Total (₹)': 100000,
    });
  });

  it('exports a party account with a running balance', async () => {
    const wb = await workbook(`type=ledger&party=${fx.c1}`);
    const account = rows(wb, 'Account');
    expect(account).toHaveLength(3);
    expect(account.at(-1)!['Running Balance (₹)']).toBe(fx.i2.total / 2 + fx.i4.total);
  });

  it('rejects an unknown party with 400', async () => {
    const res = await GET(new NextRequest('http://localhost/api/report?type=ledger&party=99999'));
    expect(res.status).toBe(400);
  });
});
