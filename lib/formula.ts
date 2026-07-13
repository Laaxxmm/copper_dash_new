// The verified copper price formula — identical in Book1.xlsx and the uploaded
// Savli/Metrod PI. Pure (no DB, no imports) so the server, the client board,
// and the tests all use exactly one implementation.
//
//   rate_inr_per_kg = (LME + premium + transaction)      [all USD per MT]
//                     x (1 + factor% / 100)
//                     x (exchange_rate / 1000)            [USD -> INR, RBI or SBI TT]
//                     + handling_inr_mt / 1000
//
// Verified: Book1 -> ₹1028.21/kg, PI -> ₹1365.46/kg (both to the paise).

export type PriceInputs = {
  lme_usd_mt: number;
  premium_usd_mt: number;
  transaction_usd_mt: number;
  factor_pct: number;     // percent, e.g. 3.75 or 5.5 (NOT the 1.055 multiplier)
  exchange_rate: number;  // USD -> INR (the party's RBI or SBI TT rate)
  handling_inr_mt: number;
};

const paise = (x: number) => Math.round(x * 100) / 100;

export function ratePerKg(i: PriceInputs): number {
  const raw =
    (i.lme_usd_mt + i.premium_usd_mt + i.transaction_usd_mt) *
      (1 + i.factor_pct / 100) *
      (i.exchange_rate / 1000) +
    i.handling_inr_mt / 1000;
  return paise(raw);
}

export function amountInr(perKgRate: number, qtyKg: number): number {
  return paise(perKgRate * qtyKg);
}

export function gstAmount(amount: number, gstPct = 18): number {
  return paise((amount * gstPct) / 100);
}

/** A factor stored as a multiplier (1.055) -> percent (5.5). Pass-through if already percent. */
export function factorToPercent(stored: number): number {
  return stored > 0 && stored < 2 ? (stored - 1) * 100 : stored;
}
