import { describe, expect, it } from 'vitest';
import { composePO, amountInWords, rupeesInWords, isInterState } from '@/lib/po';

describe('purchase-order money (golden: Savli PI)', () => {
  it('reproduces the Savli PI to the paise', () => {
    const po = composePO({
      lme_usd_mt: 13508.5, premium_usd_mt: 180, transaction_usd_mt: 0,
      factor_pct: 3.75, exchange_rate: 95.71, handling_inr_mt: 6200,
      qty_mt: 4.178, gstPct: 18, interState: true,
    });
    expect(po.rate_inr_kg).toBe(1365.46);
    expect(po.qty_kg).toBe(4178);
    expect(po.base).toBe(5704891.88);
    expect(po.igst).toBe(1026880.54);
    expect(po.gross).toBe(6731772.42);
    expect(po.words).toBe('Sixty Seven Lakh Thirty One Thousand Seven Hundred Seventy Two Rupees Forty Two Paise');
  });

  it('splits CGST/SGST when intra-state', () => {
    const po = composePO({
      lme_usd_mt: 13508.5, premium_usd_mt: 180, transaction_usd_mt: 0,
      factor_pct: 3.75, exchange_rate: 95.71, handling_inr_mt: 6200,
      qty_mt: 4.178, interState: false,
    });
    expect(po.igst).toBe(0);
    expect(po.cgst + po.sgst).toBe(po.tax);
    expect(po.cgst).toBeCloseTo(po.tax / 2, 2);
  });
});

describe('amount in words (Indian system)', () => {
  it('handles rupees and paise', () => {
    expect(rupeesInWords(6731772)).toBe('Sixty Seven Lakh Thirty One Thousand Seven Hundred Seventy Two');
    expect(amountInWords(6731772.42)).toBe('Sixty Seven Lakh Thirty One Thousand Seven Hundred Seventy Two Rupees Forty Two Paise');
    expect(amountInWords(100000)).toBe('One Lakh Rupees Only');
    expect(amountInWords(2500000.5)).toBe('Twenty Five Lakh Rupees Fifty Paise');
    expect(rupeesInWords(0)).toBe('Zero');
  });
});

describe('inter-state detection', () => {
  it('compares GSTIN state codes (KA 29 → TN 33 is inter-state)', () => {
    expect(isInterState('29AAJCA9021H1ZK', '33AACCA2293G1Z0')).toBe(true);
    expect(isInterState('33AAA', '33BBB')).toBe(false);
    expect(isInterState(null, '33AAA')).toBe(true);
  });
});
