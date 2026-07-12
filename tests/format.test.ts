import { describe, expect, it } from 'vitest';
import { BASIS_LABEL, MODE_LABEL, TRUCK_LABEL, daysBetween, dateShort, inr, inrFull, monthLabel, mt, perKg } from '@/lib/format';

describe('format', () => {
  it('formats rupees in the Indian system (Cr / L / plain)', () => {
    expect(inr(2_50_00_000)).toBe('₹2.50 Cr');
    expect(inr(2_50_000)).toBe('₹2.5 L');
    expect(inr(999)).toBe('₹999');
    expect(inr(-1_20_00_000)).toBe('₹-1.20 Cr');
    expect(inrFull(1234567)).toBe('₹12,34,567');
  });

  it('formats rates the way the trade talks (₹/kg from ₹/MT)', () => {
    expect(perKg(895500)).toBe('₹895.5/kg');
    expect(perKg(900000)).toBe('₹900/kg');
  });

  it('formats quantities and dates', () => {
    expect(mt(3)).toBe('3 MT');
    expect(mt(12.5)).toBe('12.5 MT');
    expect(dateShort('2026-07-11')).toBe('11 Jul');
    expect(dateShort(null)).toBe('—');
    expect(monthLabel('2026-07')).toMatch(/Jul/);
  });

  it('computes day differences', () => {
    expect(daysBetween('2026-07-01', '2026-07-11')).toBe(10);
    expect(daysBetween('2026-07-11', '2026-07-01')).toBe(-10);
  });

  it('has a plain-language label for every enum the schema allows', () => {
    expect(Object.keys(BASIS_LABEL).sort()).toEqual(
      ['DAY_PRICE', 'FIXED', 'FORTNIGHT_AVG', 'MONTH_AVG', 'PRICE_LATER', 'WEEK_AVG'].sort());
    expect(Object.keys(TRUCK_LABEL).sort()).toEqual(['ARRIVED', 'IN_TRANSIT', 'UNLOADED'].sort());
    expect(Object.keys(MODE_LABEL).sort()).toEqual(['CASH', 'CHEQUE', 'IMPS', 'NEFT', 'RTGS', 'UPI'].sort());
  });
});
