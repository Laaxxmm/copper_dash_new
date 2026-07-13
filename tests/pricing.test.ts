import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { amountInr, factorToPercent, gstAmount, ratePerKg } from '@/lib/formula';
import { destroyTestDb, useTestDb } from './helpers';
import { run } from '@/lib/db';
import { fxRate, latestLme, products, resolveLme, supplierBoard } from '@/lib/pricing';

// ---- the acceptance check: the engine reproduces the source documents ----
describe('pricing formula — verified against Book1 and the PI', () => {
  it('reproduces Book1.xlsx to the paise (₹1028.21/kg)', () => {
    expect(ratePerKg({
      lme_usd_mt: 10600, premium_usd_mt: 250, transaction_usd_mt: 10,
      factor_pct: 5.5, exchange_rate: 89.21, handling_inr_mt: 6100,
    })).toBe(1028.21);
  });

  it('reproduces the uploaded PI to the paise (₹1365.46/kg)', () => {
    expect(ratePerKg({
      lme_usd_mt: 13508.5, premium_usd_mt: 180, transaction_usd_mt: 0,
      factor_pct: 3.75, exchange_rate: 95.71, handling_inr_mt: 6200,
    })).toBe(1365.46);
  });

  it('computes amount and GST like the documents', () => {
    expect(amountInr(1028.21, 2518)).toBe(2589032.78);      // Book1 amount
    expect(amountInr(1365.46, 4178)).toBe(5704891.88);      // PI base value
    expect(gstAmount(5704891.88)).toBe(1026880.54);         // PI IGST 18%
  });

  it('normalises a multiplier-style factor to percent', () => {
    expect(factorToPercent(1.055)).toBeCloseTo(5.5, 6);
    expect(factorToPercent(3.75)).toBe(3.75);
  });
});

// ---- the DB-backed board ----
describe('supplier board (per product, DB)', () => {
  let prodId: number, supA: number, supB: number;

  beforeAll(() => {
    useTestDb(); // migrate() seeds the wire/rod catalog automatically
    prodId = products().find((p) => p.type === 'WIRE' && p.size_mm === 1.6)!.id;
    supA = Number(run(`INSERT INTO parties (name,type,exchange_basis,credit_days) VALUES ('Sup A','SUPPLIER','RBI_TT',10)`).lastInsertRowid);
    supB = Number(run(`INSERT INTO parties (name,type,exchange_basis,credit_days) VALUES ('Sup B','SUPPLIER','SBI_TT',5)`).lastInsertRowid);
    run(`INSERT INTO supplier_terms (supplier_id,product_id,premium_usd_mt,transaction_usd_mt,factor_pct,handling_inr_mt,delivery_days,credit_days) VALUES (?,?,?,?,?,?,?,?)`, supA, prodId, 150, 10, 5.5, 6100, 4, 10);
    run(`INSERT INTO supplier_terms (supplier_id,product_id,premium_usd_mt,transaction_usd_mt,factor_pct,handling_inr_mt,delivery_days,credit_days) VALUES (?,?,?,?,?,?,?,?)`, supB, prodId, 260, 10, 5.5, 6000, 6, 5);
    run(`INSERT INTO lme_prices (price_date, usd_mt, source) VALUES (date('now'), 10600, 'manual')`);
    run(`INSERT INTO fx_rates (rate_date, basis, usd_inr) VALUES (date('now'),'RBI_TT',89.21)`);
    run(`INSERT INTO fx_rates (rate_date, basis, usd_inr) VALUES (date('now'),'SBI_TT',89.05)`);
  });
  afterAll(destroyTestDb);

  it('has the full wire/rod catalog from migrate', () => {
    const ps = products();
    expect(ps.filter((p) => p.type === 'WIRE').map((p) => p.size_mm)).toEqual([1.38, 1.6, 2.5, 3.35, 5.75]);
    expect(ps.filter((p) => p.type === 'ROD').map((p) => p.size_mm)).toEqual([8, 12.5]);
  });

  it('ranks the cheapest supplier as L1 and uses each party exchange basis', () => {
    const board = supplierBoard(prodId);
    expect(board.lme).toBe(10600);
    expect(board.rows).toHaveLength(2);
    expect(board.rows[0].tier).toBe('L1');
    expect(board.rows[0].supplier).toBe('Sup A');
    expect(board.rows[0].exchange_rate).toBe(89.21); // Sup A is RBI
    expect(board.rows[1].exchange_rate).toBe(89.05); // Sup B is SBI
    expect(board.rows[0].rate_inr_kg).toBeLessThan(board.rows[1].rate_inr_kg);
    // Sup A: (10600+150+10)*1.055*89.21/1000 + 6.1
    expect(board.rows[0].rate_inr_kg).toBe(ratePerKg({
      lme_usd_mt: 10600, premium_usd_mt: 150, transaction_usd_mt: 10,
      factor_pct: 5.5, exchange_rate: 89.21, handling_inr_mt: 6100,
    }));
  });

  it('resolves latest LME and TT rates', () => {
    expect(latestLme()!.usd_mt).toBe(10600);
    expect(resolveLme('DAY')).toBe(10600);
    expect(fxRate('RBI_TT')).toBe(89.21);
    expect(fxRate('SBI_TT')).toBe(89.05);
  });
});
