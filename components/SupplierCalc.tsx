'use client';

// Per-supplier payment calculator. Terms (premium/transaction/factor/handling)
// and the pricing basis are set once and remembered; the LME and FX move with
// the market. The ₹/kg recomputes live as you edit, using the one verified
// formula (lib/formula.ts). Save persists to supplier_terms + parties.
import { useState } from 'react';
import { ratePerKg } from '@/lib/formula';
import { saveSupplierTerms } from '@/lib/actions';

type Term = {
  product_id: number; description: string; type: string;
  premium_usd_mt: number; transaction_usd_mt: number; factor_pct: number; handling_inr_mt: number; basis: string;
};
type BasisLme = Record<string, number>;

const BASES: [string, string][] = [
  ['DAY', 'Daily (spot LME)'], ['WEEK_AVG', 'Weekly average'],
  ['FORTNIGHT_AVG', 'Fortnight average'], ['MONTH_AVG', 'Monthly average'],
];

const n = (v: string) => (v === '' ? 0 : Number(v));

function CalcForm({ supplierId, term, exchangeBasis, basisLme, rbi, sbi }: {
  supplierId: number; term: Term; exchangeBasis: string; basisLme: BasisLme; rbi: number; sbi: number;
}) {
  const [premium, setPremium] = useState(String(term.premium_usd_mt));
  const [txn, setTxn] = useState(String(term.transaction_usd_mt));
  const [factor, setFactor] = useState(String(term.factor_pct));
  const [handling, setHandling] = useState(String(term.handling_inr_mt));
  const [basis, setBasis] = useState(term.basis);
  const [exchange, setExchange] = useState(exchangeBasis);

  const lme = basisLme[basis] ?? basisLme.DAY ?? 0;
  const fx = exchange === 'SBI_TT' ? sbi : rbi;
  const rate = ratePerKg({
    lme_usd_mt: lme, premium_usd_mt: n(premium), transaction_usd_mt: n(txn),
    factor_pct: n(factor), exchange_rate: fx, handling_inr_mt: n(handling),
  });

  return (
    <form action={saveSupplierTerms} className="calc card card-pad">
      <input type="hidden" name="supplier_id" value={supplierId} />
      <input type="hidden" name="product_id" value={term.product_id} />
      <div className="calc-grid">
        <label>Premium (US$/MT)<input name="premium_usd_mt" type="number" step="1" value={premium} onChange={(e) => setPremium(e.target.value)} /></label>
        <label>Transaction (US$/MT)<input name="transaction_usd_mt" type="number" step="1" value={txn} onChange={(e) => setTxn(e.target.value)} /></label>
        <label>Factor (%)<input name="factor_pct" type="number" step="0.05" value={factor} onChange={(e) => setFactor(e.target.value)} /></label>
        <label>Handling (₹/MT)<input name="handling_inr_mt" type="number" step="50" value={handling} onChange={(e) => setHandling(e.target.value)} /></label>
        <label>Pricing basis
          <select name="basis" value={basis} onChange={(e) => setBasis(e.target.value)}>
            {BASES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Exchange
          <select name="exchange_basis" value={exchange} onChange={(e) => setExchange(e.target.value)}>
            <option value="RBI_TT">RBI TT</option>
            <option value="SBI_TT">SBI TT</option>
          </select>
        </label>
      </div>

      <div className="calc-out">
        <div className="calc-rate">₹{rate.toFixed(2)}<span>/kg</span></div>
        <div className="calc-basis">
          (LME ${Math.round(lme).toLocaleString('en-US')} + prem {n(premium)} + txn {n(txn)}) × (1 + {n(factor)}%) × ({exchange === 'SBI_TT' ? 'SBI' : 'RBI'} {fx.toFixed(2)}/1000) + {n(handling)}/1000
        </div>
      </div>

      <button className="btn" type="submit">Save terms for this product</button>
      <p className="chart-note">Set once — only the LME and the {exchange === 'SBI_TT' ? 'SBI' : 'RBI'} TT rate move with the market after this.</p>
    </form>
  );
}

export default function SupplierCalc({ supplierId, terms, exchangeBasis, basisLme, rbi, sbi }: {
  supplierId: number; terms: Term[]; exchangeBasis: string; basisLme: BasisLme; rbi: number; sbi: number;
}) {
  const [pid, setPid] = useState(terms[0]?.product_id);
  const cur = terms.find((t) => t.product_id === pid) ?? terms[0];
  if (!cur) return <p className="muted">No products configured.</p>;

  return (
    <div>
      <div className="calc-product">
        <label>Product
          <select value={pid} onChange={(e) => setPid(Number(e.target.value))}>
            <optgroup label="Wire">{terms.filter((t) => t.type === 'WIRE').map((t) => <option key={t.product_id} value={t.product_id}>{t.description}</option>)}</optgroup>
            <optgroup label="Rod">{terms.filter((t) => t.type === 'ROD').map((t) => <option key={t.product_id} value={t.product_id}>{t.description}</option>)}</optgroup>
          </select>
        </label>
      </div>
      {/* key remounts the form with fresh field values when the product changes */}
      <CalcForm key={cur.product_id} supplierId={supplierId} term={cur} exchangeBasis={exchangeBasis} basisLme={basisLme} rbi={rbi} sbi={sbi} />
    </div>
  );
}
