import { describe, expect, it } from 'vitest';
import { evalFormula, type PriceLine } from '@/lib/sale-formula';

describe('sale-price formula evaluator', () => {
  it('folds ordered cost-lines with operators into a ₹/kg (spec example)', () => {
    const lines: PriceLine[] = [
      { label: 'Copper cost', kind: 'BUY_COST', operator: 'ADD', value: 0 },
      { label: 'Fabrication', kind: 'FABRICATION', operator: 'ADD', value: 0 },
      { label: 'Wastage', kind: 'PERCENT', operator: 'ADD', value: 2 },   // +2% of running
      { label: 'Margin', kind: 'FIXED', operator: 'ADD', value: 9 },
    ];
    const { price, steps } = evalFormula(lines, { buy_cost: 951, fabrication: 18 });
    // 951 → +18 = 969 → +2% (19.38) = 988.38 → +9 = 997.38
    expect(steps.map((s) => s.running)).toEqual([951, 969, 988.38, 997.38]);
    expect(price).toBe(997.38);
  });

  it('supports multiply, divide and average operators', () => {
    const mul = evalFormula([
      { label: 'base', kind: 'FIXED', operator: 'ADD', value: 1000 },
      { label: 'x1.02', kind: 'FIXED', operator: 'MUL', value: 1.02 },
    ], { buy_cost: 0, fabrication: 0 });
    expect(mul.price).toBe(1020);

    const avg = evalFormula([
      { label: 'day', kind: 'FIXED', operator: 'ADD', value: 900 },
      { label: 'month', kind: 'FIXED', operator: 'AVG', value: 1000 },
    ], { buy_cost: 0, fabrication: 0 });
    expect(avg.price).toBe(950);

    const div = evalFormula([
      { label: 'total', kind: 'FIXED', operator: 'ADD', value: 1000 },
      { label: 'per', kind: 'FIXED', operator: 'DIV', value: 4 },
    ], { buy_cost: 0, fabrication: 0 });
    expect(div.price).toBe(250);
  });

  it('divide-by-zero leaves the running total unchanged (no NaN)', () => {
    const { price } = evalFormula([
      { label: 'base', kind: 'FIXED', operator: 'ADD', value: 500 },
      { label: 'oops', kind: 'FIXED', operator: 'DIV', value: 0 },
    ], { buy_cost: 0, fabrication: 0 });
    expect(price).toBe(500);
  });
});
