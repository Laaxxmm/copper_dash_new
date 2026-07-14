// Purchase-order composition. Pure (no DB) so it's golden-tested against the
// real Savli PI: qty 4178 kg, LME 13508.50, premium 180, factor 3.75%,
// exchange 95.71, handling 6200 -> ₹1365.46/kg, base ₹57,04,891.88,
// IGST 18% ₹10,26,880.54, gross ₹67,31,772.42.
import { ratePerKg, amountInr, gstAmount, type PriceInputs } from './formula';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigit(n: number): string {
  return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
}
function threeDigit(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  return (h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? twoDigit(r) : '');
}

/** Indian numbering system (crore / lakh / thousand / hundred). */
export function rupeesInWords(rupees: number): string {
  if (rupees === 0) return 'Zero';
  const crore = Math.floor(rupees / 10000000); rupees %= 10000000;
  const lakh = Math.floor(rupees / 100000); rupees %= 100000;
  const thousand = Math.floor(rupees / 1000); rupees %= 1000;
  const parts = [
    crore ? threeDigit(crore) + ' Crore' : '',
    lakh ? twoDigit(lakh) + ' Lakh' : '',
    thousand ? twoDigit(thousand) + ' Thousand' : '',
    rupees ? threeDigit(rupees) : '',
  ].filter(Boolean);
  return parts.join(' ');
}

/** "…Rupees …Paise" / "…Rupees Only" — the PI/PO amount-in-words form. */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(amount + 1e-6);
  const paise = Math.round((amount - rupees) * 100);
  const r = `${rupeesInWords(rupees)} Rupees`;
  return paise ? `${r} ${twoDigit(paise)} Paise` : `${r} Only`;
}

export type POComputation = {
  rate_inr_kg: number; qty_kg: number; base: number;
  igst: number; cgst: number; sgst: number; tax: number; gross: number; words: string;
};

/** Compute a PO's money from the pricing inputs + quantity. inter-state → IGST,
 *  else CGST+SGST split. Reproduces the Savli PI to the paise. */
export function composePO(i: PriceInputs & { qty_mt: number; gstPct?: number; interState?: boolean }): POComputation {
  const gstPct = i.gstPct ?? 18;
  const interState = i.interState ?? true;
  const rate = ratePerKg(i);
  const qty_kg = Math.round(i.qty_mt * 1000 * 1000) / 1000;
  const base = amountInr(rate, qty_kg);
  const tax = gstAmount(base, gstPct);
  const gross = Math.round((base + tax) * 100) / 100;
  const half = Math.round((tax / 2) * 100) / 100;
  return {
    rate_inr_kg: rate, qty_kg, base,
    igst: interState ? tax : 0,
    cgst: interState ? 0 : half,
    sgst: interState ? 0 : tax - half,
    tax, gross, words: amountInWords(gross),
  };
}

/** Two GSTINs are inter-state when their leading 2-digit state codes differ. */
export function isInterState(gstinA: string | null, gstinB: string | null): boolean {
  const a = (gstinA ?? '').slice(0, 2), b = (gstinB ?? '').slice(0, 2);
  if (!a || !b) return true; // unknown → default IGST (safer for cross-state producers)
  return a !== b;
}
