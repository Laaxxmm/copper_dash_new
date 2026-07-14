# CopperBook — Procurement-Flow UI Revamp (Design)

Date: 2026-07-14
Status: Draft for approval

## 1. Purpose & framing

Rebuild the CopperBook UI so it maps 1:1 onto the real buy-side procurement flow of the
trader (our user = **Athivinayakar Wires**, the *buyer*). No feature bloat, plain English,
no jargon. The pricing/PI/PO/LME engine already built (Phases 1–5) is **reused**; this is
mainly a re-organisation of the UI plus a few new data pieces.

**Scope:** buy-side only (buying copper from suppliers). **Sales** (selling to the trader's
own customers) is explicitly out — it gets its own section later and is not in this nav.

The end-to-end flow this UI must serve:

1. Set a **monthly tonnage target per supplier, per product**, and watch **target vs actually
   lifted** as KPI cards (daily achievement).
2. See suppliers ranked **L1/L2/L3…** (rank set manually, cheapest-first shown as a hint);
   set each month's target per supplier; phone the supplier to confirm he can supply.
3. Supplier emails a **PI**; we send a **PO** back and release payment. PI/PO are pulled from
   the **mailbox** (supplier mapped by email domain/keyword), parsed, and auto-populated.
4. The supplier's **agreed quantity** is logged and shown on the supplier's KPI.
5. A per-supplier **payment formula** (LME × RBI-TT | SBI-TT, with premium/factor/handling
   set once and remembered; LME & FX move with the market; all fields editable; product +
   basis chosen).
6. A **dedicated page per supplier** holds that detailed calculation so the dashboard stays clean.
7. **Order tracker**: every order (1 MT … 100 MT) in sequence, with **left-rail filters**
   (day / week / month / custom range, wire vs rod + size, supplier, status) and a **Clear** button.
8. **Download report** for the filtered orders.
9. Dashboard **analysis: which supplier is better**.
10. **Cost of purchase** KPI — how much we have paid / committed to suppliers.
11. **Accurate live LME + news**; **date top-right**; **company logo top-left of the nav**.
12. Sales handled separately later.
13. **Basis-aware cost average** — every lift carries the **pricing basis it was fixed on**
    (day / CSP / week-avg / fortnight-avg / month-avg / price-later). The supplier page and
    dashboard show the **blended ₹/kg cost average**, broken down by basis, so the user can see
    the true overall cost of what was actually lifted from each supplier.

## 2. Information architecture (new navigation)

Left nav, company logo at top, date pinned top-right on every page.

| New route | Replaces | Purpose |
|---|---|---|
| `/` **Dashboard** | Today | KPI overview: target-vs-lifted per supplier, cost of purchase, exposure, best-supplier analysis, live LME + news, **Send PO** entry |
| `/suppliers` **Suppliers** | where-to-buy + requirements + parties | Ranked L1..Ln list, monthly target/agreed/lifted per product, set rank + target |
| `/suppliers/[id]` **Supplier page** | parties/[id] | Per-product payment calculator, month targets, this supplier's orders + PI/PO log, contact |
| `/orders` **Orders** | bookings + money + profit | Every buy order, sequential, left filters, download |
| `/inbox` **Inbox** | inbox | Mailbox PI/PO pipeline: domain/keyword match → parse → confirm → auto-populate |
| `/market` **Market** | news | Live LME + news |
| `/settings` **Settings** | settings | Company profile, mailbox (Gmail) setup, LME entry, demo/erase |

Retired routes (`/where-to-buy`, `/requirements*`, `/parties*`, `/bookings`, `/money`,
`/profit`, `/reports`, `/news`) are removed or redirected; their logic moves into the pages
above. `/add` is kept as a **slim quick-add** (booking, price fix, payment, LME, CSP) — most
entry becomes contextual (set target on a supplier, fix price on an order).

## 3. Page specifications

### 3.1 Dashboard (`/`)
- **Header:** company logo (nav), page title, **month picker**, **date top-right**.
- **Live strip:** LME cash (source + timestamp) + FX + ₹/kg indication + latest news headline.
- **KPI cards (Magna-style), for the selected month:**
  - Per supplier: **target · agreed · lifted** (MT) with achievement % and a small daily-cumulative sparkline.
  - **Cost of purchase** — ₹ committed/paid to suppliers this month (see §5).
  - **Quantity without a price** — unpriced PRICE_LATER exposure (existing `unpricedExposure`).
- **Best-supplier analysis** — ranked table (margin, on-time %, transit days, weight cut) from `supplierScorecard`.
- **Send PO** button → PO composer (§4).

### 3.2 Suppliers (`/suppliers`)
- List ordered by **manual rank** (`parties.manual_rank`); each row shows the **computed
  cheapest-first tier** beside it as a hint (from `supplierBoard`).
- Per row, for the selected month + product: **target / agreed / lifted** with a progress bar.
- Inline actions: **set rank**, **set target** (per product, per month), open supplier page.
- Month + product selectors at top.

### 3.3 Supplier page (`/suppliers/[id]`)
- **Payment calculator** (per product): editable premium_usd_mt, transaction_usd_mt,
  factor_pct, handling_inr_mt, **basis** (day / week / fortnight / month-avg), and
  **exchange basis** (RBI_TT | SBI_TT). Saved to `supplier_terms` + `parties.exchange_basis`;
  remembered. Live **LME** and **FX** pulled in; recompute shows ₹/kg using the verified formula.
- **This month:** target / agreed / lifted per product; DNPL pricing-deadline + $200/MT
  margin-call flags (existing `alerts` logic, scoped to supplier).
- **Orders** from this supplier (link into `/orders?supplier=`).
- **PI/PO log** for this supplier (from `email_captures` + PO records).
- **Contact:** phone, email, GSTIN; "Call to confirm" affordance; **Send PO** button.

### 3.4 Orders (`/orders`)
- Sequential list of buy orders (bookings joined to liftings/fixations/invoices), newest first.
- **Left filter rail:** date mode (day / week / month / **custom from–to**), product type
  (wire / rod) + size, supplier, status; **Clear filters** button; filters encoded in the URL.
- Each row: date, order no, supplier, product, qty, rate/basis, priced?, lifted?, PO amount, status.
- **Download** button → `/api/report` with the active filter (reuses existing Excel route).

### 3.5 Inbox (`/inbox`) — mailbox PI/PO pipeline
- **Source of documents:** (a) paste/forward text now; (b) Gmail fetch once configured (§6).
- **Matching:** incoming message → supplier by **email domain** (`parties.email` domain) or
  **keyword** (`parties.mail_keywords`); document type by keywords (PROFORMA INVOICE→PI,
  PURCHASE ORDER→PO, CANCEL/CANCELLED→CANCEL). Existing `parseDoc` extracts qty/rate/total and
  runs the recompute guardrail.
- **Confirm** → auto-populate: logs supplier **agreed_mt**, updates the linked
  allocation/order, and feeds the dashboard.
- **Cancellation:** a CANCEL doc referencing a PO/PI number marks that PO cancelled and
  **reverses** its amount from cost-of-purchase and the KPIs.

### 3.6 Market (`/market`)
- Live LME (westmetall) + FX + news (Google News RSS), each stamped with source + time.
  Hardened parsing; manual LME confirm remains the source of truth (§7).

### 3.7 Settings (`/settings`)
- **Company profile** (the PO "buyer" block): name, address, GSTIN, state code, PAN, CIN,
  bank name/branch/IFSC/account. Seeded with Athivinayakar's details, editable.
- **Mailbox (Gmail) setup:** email address, app password, IMAP host/port, poll interval, and
  the per-supplier **domain/keyword map**. Stored in `settings`. *Live fetch runs only when
  credentials are present and a fetch worker can run (see §6/Caveats).*
- Existing: LME entry, reload demo, erase.

## 4. PO generation & sending

Reproduces the supplier's **REVISED PO** format (SAVLI sample). A PO is composed from:

- **Buyer block** ← Settings company profile (Athivinayakar).
- **Supplier block** ← the supplier record (name, address, GSTIN, state code, bank).
- **Line item** ← product description + **quantity** (from target/agreed) + **provisional
  rate** = `ratePerKg(...)` using **live LME** and the supplier's remembered terms + basis + FX.
- **Tax:** **IGST 18%** when supplier state code ≠ buyer state code (inter-state; the SAVLI
  case: KA 29 → TN 33), else CGST 9% + SGST 9%. Derived from GSTIN state codes.
- **Totals:** base = rate × qty(kg); tax; gross; **amount in words** (Indian system).
- **Terms:** provisional pricing (DNPL/PNDL), $200/MT margin call, RBI/SBI referral rate note —
  static text block matching the PI.

**Worked reference (must reproduce):** 5.75 mm EC CU wire, 4178 kg, LME 13508.50, premium 180,
txn 0, exchange 95.71, factor 3.75%, handling 6200 → **₹1365.46/kg**; base **₹57,04,891.88**;
IGST 18% **₹10,26,880.54**; gross **₹67,31,772.42**; words "Sixty Seven Lakh Thirty One
Thousand Seven Hundred Seventy Two Rupees Forty Two Paise".

**Sending:** rendered as a printable PO (HTML → the user can print/PDF) and a **mailto**
draft to the supplier now; via the Gmail transport once configured.

**Tracking:** on send, the PO's **gross amount** is recorded as **committed cost of purchase**
for that supplier (payment terms are 100% advance, so committed = to-be-paid). It appears in
the Cost-of-purchase KPI and the supplier's page. A later **CANCEL** for that PO reference
reverses it.

## 5. Cost-of-purchase tracking

`cost_of_purchase(month)` = sum of **gross PO amounts** issued to suppliers in that month,
minus any that were **cancelled**, reconciled with actual `payments (direction='OUT')` where
recorded. Shown as a dashboard KPI and per supplier. PO records live in a new lightweight
`purchase_orders` table (see §8); actual bank payments continue in `payments`.

**Basis-aware cost average.** Each lift is priced through `price_fixations` against a booking
whose `pricing_basis` records *how* it was priced (day / CSP / week / fortnight / month-avg /
price-later). Per supplier: `avg_cost ₹/kg = Σ(fixed_rate × lifted_qty) / Σ(lifted_qty)`,
also grouped by basis, so the user sees the blended cost and which basis drove it. Derived —
no new column; `bookings.pricing_basis` already exists.

## 6. Mailbox / Gmail

- **Config** (Settings): IMAP host (default `imap.gmail.com:993`), address, app password,
  poll interval, domain/keyword map. Persisted in `settings`.
- **Fetch worker:** a server action / route that connects over IMAP, pulls unseen messages,
  runs the same `parseDoc` + matcher, and writes `email_captures` rows (PENDING) for human
  confirmation — never auto-books without confirm.
- **This environment cannot hold or run live credentials**, so the worker ships behind the
  config: it activates only when the user enters credentials in the running app. Until then the
  **paste/forward** path (already built) feeds the identical pipeline. Gmail app-password over
  IMAP is the transport; no OAuth flow is attempted here.

## 7. Pricing formula & LME accuracy

- Formula is the verified `ratePerKg` in `lib/formula.ts` (reproduces PI ₹1365.46 and the PO).
  Inputs: LME (live/confirmed), premium, transaction, factor%, exchange (RBI/SBI TT), handling.
- **LME/news** are best-effort scrapes (westmetall + Google News). We harden the parse, always
  show **source + timestamp**, and keep the **manual LME confirm** (Phase 5) as the source of
  truth. An official/paid feed can replace the scrape later.

## 8. Data-model changes (idempotent migration in `lib/migrate.ts`)

- **NEW `supplier_targets`** — `(id, supplier_id, product_id, month TEXT 'YYYY-MM',
  target_mt REAL DEFAULT 0, agreed_mt REAL DEFAULT 0, UNIQUE(supplier_id, product_id, month))`.
  Actual-lifted is **derived** from `liftings`+`bookings`, not stored.
- **NEW `purchase_orders`** — `(id, po_no TEXT UNIQUE, supplier_id, product_id, month,
  qty_mt, rate_inr_kg, base_amount, tax_amount, gross_amount, lme_usd, fx_rate, basis,
  status TEXT CHECK(status IN ('SENT','CANCELLED')) DEFAULT 'SENT', created_date, cancelled_date,
  capture_id REFERENCES email_captures(id))`.
- `parties.manual_rank INTEGER` — the L-rank.
- `parties.mail_keywords TEXT` — inbox matching (domain derives from `parties.email`).
- `supplier_terms.default_basis TEXT DEFAULT 'DAY'` — remembered per-supplier-product basis.
- `settings` rows for company profile + mailbox config (no schema change; key/value).

All additions are `CREATE TABLE IF NOT EXISTS` / guarded `ALTER TABLE ADD COLUMN`, matching the
existing migration style, so the Railway volume upgrades in place. **No numbered SQL params**
(Node 22 constraint).

## 9. Reused vs new

- **Reused:** `formula.ts`, `pricing.ts` (supplierBoard, resolveLme, fxRate, lmeStrip),
  `capture.ts`/`parseDoc`, `market.ts` (LME + news), `/api/report` Excel, `alerts`,
  `supplierScorecard`, auth/middleware, DB layer.
- **New:** the 7-page IA + nav (logo, date), `supplier_targets` + KPI queries, manual rank,
  supplier calculator UI, orders filter rail, PO composer + `purchase_orders` + tracking,
  Gmail config + IMAP worker, company profile.

## 10. Phase plan (reviewable commits; nothing left half-broken)

- **A — Shell + Dashboard:** migration (all §8 additions), new nav (logo, date), Dashboard KPI
  cards (target/agreed/lifted, cost of purchase, exposure, best-supplier), live strip. Retire Today.
- **B — Suppliers + monthly targets:** `/suppliers` list, manual rank, set-target per
  product/month, target/agreed/lifted. Fold People in.
- **C — Supplier page + calculator:** `/suppliers/[id]`, editable remembered terms + basis + FX,
  live recompute, month targets, orders, PI/PO log, contact.
- **D — Orders tracker + reports:** `/orders` sequential + left filter rail + Clear + filtered download.
- **E — PO composer + Inbox pipeline:** PO generator (format + calc + IGST + words), send, track
  as cost-of-purchase; Settings company profile; Inbox domain/keyword match → confirm →
  auto-populate + agreed_mt; cancellation reversal.
- **F — Mailbox (Gmail) + polish:** Settings Gmail config + IMAP fetch worker (credential-gated),
  LME/news accuracy hardening, remove dead routes, tests green.

Each phase: verified in the browser, `vitest` + `tsc` green, pushed to GitHub.

## 11. Testing

- Pure logic gets unit tests (vitest, temp-DB fixtures): target/lifted KPI math, cost-of-purchase
  (incl. cancellation reversal), PO amount + IGST + amount-in-words (must reproduce the SAVLI
  worked example), rank ordering, filter query builder, domain/keyword matcher.
- Each phase keeps the suite green; the SAVLI PO figures are a golden test.

## 12. Constraints / caveats

1. **Live mailbox fetch** needs a Gmail app password entered in the running app; not runnable in
   this dev environment. Paste/forward feeds the same pipeline until then.
2. **LME/news** accuracy depends on third-party sources; manual LME confirm stays authoritative.
3. **Sales** is out of scope here by request.
4. Storing a Gmail app password server-side is sensitive; it lives in the `settings` table on the
   user's own deployment/volume and is never handled by the assistant.
