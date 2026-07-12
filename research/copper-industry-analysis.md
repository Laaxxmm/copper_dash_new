# Copper Procurement & Trading in India — Industry Analysis

*Research date: 11 July 2026. Compiled from a verified multi-source deep-research pass (20 sources, 87 claims extracted, 25 adversarially verified — 22 confirmed, 3 refuted). Purpose: ground the design of a booking / lifting / payments tracking system for a mid-size copper business that buys from multiple suppliers and takes bookings from its own customers.*

---

## 1. Industry structure — who sells copper, who buys it

India's primary refined copper industry is a tight oligopoly:

| Player | Role | Capacity / status |
|---|---|---|
| **Hindustan Copper Ltd (HCL)** | Only miner; minor refined producer today | Sells concentrate via LME-linked tender; cathode/CC rod via published Basic Price |
| **Hindalco (Birla Copper)** | Largest producer — port-based custom smelter at Dahej, Gujarat | ~5 lakh tpa; 407 kt produced FY23; meets >50% of domestic refined demand |
| **Vedanta (Sterlite)** | Tuticorin smelter shut since 2018; only Silvassa refinery operating | 2.16 lakh tpa |
| **Adani (Kutch Copper)** | New entrant, Mundra | 5 lakh tpa Phase-I; commissioning as of Aug 2025, LME brand approval ~July 2026 |

Since Tuticorin's closure India flipped from net exporter to **net importer** of refined copper (imports up ~107% YoY in FY24). Material flows: producer → (importer/trader/dealer layer) → downstream consumers — wire-rod plants, winding-wire and cable makers, brass/alloy units, and manufacturers using copper as an input. Downstream buyers depend heavily on Hindalco and Vedanta, and **plant shutdowns regularly disrupt supply and price — multi-supplier sourcing is an operating necessity, not a choice.** (Verified: HCL corporate presentation, Hindalco disclosures, CSEP, Govt of India MSME diagnostic study.)

## 2. How pricing works — CSP is a formula, not a quote

Domestic producer prices are **mechanically derived from the LME**, not independently set:

> **Basic Price = [(LME price + product premium in USD) × multiplication factor (~1.04–1.058) × USD/INR rate (SBI TT selling / FBIL)] + handling charges (~₹3,300/MT)**

- Premiums rise with degree of processing: cathode ~USD 80/t, cut cathode 110–130, CC rod 160–240 (HCL figures; Hindalco/Vedanta use the same mechanism, exact numbers differ).
- The premium also **varies by booking method** (e.g. +20 USD/t for price-circular / weekly / fortnightly average bookings vs daily CSP).
- Domestic CCR wire-rod prices track LME closely; MCX gives the INR hedging/reference leg.

**Software implication:** price on a booking should be a *parameterized formula* (reference price, premium, factor, FX, handling), never a free-text number.

## 3. Booking types — a formal menu (verified producer-side)

Producers officially support multiple pricing bases for the same physical purchase:

1. **Daily CSP** — book at the day's published price.
2. **Average bookings** — month average, fortnight average (1st–15th / 16th–end), week average (W1–W4). *This is exactly the "CSP or month average or period average" in your client's trade.*
3. **Real-time** — live LME-linked booking.
4. **Price-circular** based booking.

And critically, **booking and lifting are decoupled**:

- **Book first, lift later** — forward lifting 1/2/3 (even 6) months out, with minimum lot sizes (HCL: 9 MT).
- **Lift first, price later** — take delivery at a *provisional* price and fix the final price afterward over a quotational period (QP). This is a standard, globally recognized convention in physical metals trade (verified via LME education material and CTRM software documentation). Buyers do this to float the price when they expect it to fall, or to match the price fixation to their own onward sale.

**The unfixed (unpriced) quantity is the business's price exposure.** Any tracking system needs: booking → price fixation(s) → lifting/dispatch as **three separate dated events** against a contract balance, with a status lifecycle (provisional → fixed) and reporting on unfixed quantity.

## 4. Back-to-back trade

The client's customers give them bookings (which those customers in turn derive from *their* customers), and the client places corresponding bookings on suppliers. The spread between purchase basis and sale basis (premium over CSP/LME, plus timing mismatch between fixations) is the margin — and the risk. *Note: trader-level back-to-back position management practices were not independently verifiable from public sources; treat as domain knowledge to confirm with the client. The mechanism (LME/CSP reference + premium, exposure between unmatched purchase and sale positions) is verified.*

## 5. Payments and credit — the verified pain point

- Producers sell on **advance payment or LC**; finished goods (e.g. winding wire) sell on **~60 days' largely unsecured credit** → a **~90-day cash-flow cycle**, documented as one of the sector's biggest pain points (Govt of India MSME-DI study).
- Copper is **~90–93% of finished-product cost** — value addition is thin, so businesses can't afford inventory and are heavily exposed to price movement between purchase and sale.
- Payment modes: RTGS/NEFT with UTR references; ledger reconciliation between buyer and supplier is standard practice. *(Reconciliation practice detail: unverified from public sources — validate with client.)*

## 6. How the industry tracks this today

- Small/mid-size traders and processors predominantly run on **manual registers, Excel, and Tally** (widely believed; not independently verified — matches your client's description exactly).
- **CTRM software exists for metals** (quotational-period pricing, position keeping, mark-to-market — e.g. Datamine MineMarket; Robosoft's Robocommodity on Dynamics 365 BC explicitly targets copper trading in India/Gulf) but is positioned at **mid-to-large traders**. There is a credible **gap at the small/mid tier** — exactly where your client sits.

## 7. What was NOT verifiable (validate with the client)

The day-to-day operational layer survived no independent verification and must be captured directly from the client:

- Order confirmation practice (phone/WhatsApp, sauda/contract notes)
- Dispatch and weighbridge process, truck assignment, e-way bills, delivery challans
- Unloading process, who unloads, weight-shortage and quality claims
- GST invoicing flow against bookings/lifting
- Interest on delayed payments; actual reconciliation cadence
- Hindalco/Vedanta's current exact booking menus and premiums for trade customers

## 8. Refuted claims (do not rely on these)

- ❌ HCL is *not* the sole vertically integrated producer feeding all smelters as described.
- ❌ Producers do *not* circulate monthly price circulars anymore — HCL discontinued them (~end 2020) in favor of LME-linked daily/real-time pricing.
- ❌ "Premiums can't be hedged at all" — overstated; treat premium-hedging claims cautiously.

## Key sources

- Hindustan Copper: [Premium/pricing formula](https://www.hindustancopper.com/Page/Premium), [Booking options](https://www.hindustancopper.com/Page/BookingOptions), [LME pricing summary (PDF)](https://www.hindustancopper.com/Content/PDF/LME.pdf), [Corporate presentation Aug 2025](https://www.hindustancopper.com/Content/PDF/Corporate-Presentation-11.09.2025.pdf)
- [Hindalco Copper business](https://www.hindalco.com/businesses/copper)
- [CSEP — Decoding Copper Cathode](https://csep.org/blog/decoding-copper-cathode-navigating-through-the-indian-copper-market/)
- [Govt of India MSME-DI diagnostic study — Winding Wire (PDF)](https://dcmsme.gov.in/Winding%20Wire.pdf)
- [LME — How LME prices are referenced in physical contracts](https://www.lme.com/en/education/online-resources/lme-digest/how-are-the-lme-prices-referenced-in-physical-contracts)
- [Datamine MineMarket — QP/hedging docs](https://docs.dataminesoftware.com/MineMarket/Latest/G-CTRM/03-Hedging/Hedging.htm)
- [Fastmarkets copper cathode premium methodology (PDF)](https://www.fastmarkets.com/uploads/02/5e/53ac81d0492db36cbf2ca7335247/fm-mb-copper-cathode-premium.pdf)
- [CTRM Center — metals software directory](https://www.ctrmcenter.com/resources-category/metals-trading-risk-and-management-software/), [Robosoft CTRM](https://www.robo-soft.com/robosoft-ctrm-software/)
