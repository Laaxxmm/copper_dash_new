# CopperBook — Sales Phase (Design)

Date: 2026-07-14
Status: Draft for approval

## 1. Purpose

The client has been buying copper (the Purchase side, already built). This phase adds the
**Sales side**: he resells copper as-is, or fabricates a finished product to a customer's spec,
prices it per customer with a configurable formula, runs the reverse PI→PO→deliver→collect flow,
and sees **true profitability** (gross margin minus overheads), per customer and overall.

Locked decisions (from brainstorming):
1. Pricing formula = **ordered cost-lines, each with an operator** (+ − × ÷ avg), saved as
   **reusable templates**. No free-text parser.
2. Each sale is **linked to the source purchase lot** → exact buy cost + exact **buy-basis vs
   sell-basis** comparison for the mismatch P&L.
3. Nav: **Dashboard · Purchase · Sales · Finance · Settings**.
4. Fabrication is a **pricing layer** only for now (a fabrication cost in the formula); no
   physical yield/scrap tracking yet.

## 2. Navigation (clean bifurcation)

Sidebar top level → each a hub page with its own tabs:

| Section | Tabs / contents |
|---|---|
| **Dashboard** | Overall + per-customer profitability, buy KPIs, collections due |
| **Purchase** | Suppliers · Orders · POs · Supplier inbox (existing buy-side, regrouped) |
| **Sales** | Customers · Products & pricing · Sell orders · Collections · Customer inbox |
| **Finance** | Expenses (overheads) · Profitability detail |
| **Settings** | Company profile · Mail (Gmail + maps) · Feature toggles |

Existing routes (`/suppliers`, `/orders`, `/po`, `/inbox`) move under **Purchase**; **Market**
(`/news`) folds into Purchase or Settings. New Sales routes live under `/sales/*`.

## 3. Products & the pricing formula (points 1–2)

- **Sale product** = `{ customer, name, raw material (wire/rod product), fabrication cost,
  pricing template }`. A customer can have many products.
- **Pricing template** = an ordered list of **lines**, reusable across products/customers. Each
  line: `label`, `kind`, `value`, `operator`.
  - `kind` ∈ **BUY_COST** (the ₹/kg this client got the material at — from the linked purchase),
    **FABRICATION** (the product's fabrication cost), **FIXED** (a ₹/kg amount you type),
    **PERCENT** (a % of the running total).
  - `operator` ∈ **ADD · SUB · MUL · DIV · AVG** (avg = mean of running total and this line).
  - Evaluated top-to-bottom into a running ₹/kg; the result is the **selling price**. A live
    preview shows each step (like reading down an Excel column).
- Templates are **saved and reused**; a product picks a template and fills its own
  fabrication/fixed values. Editing values re-previews instantly.

Example (draw 8mm rod → 2.5mm wire for Customer X):
`BUY_COST 951 (start) → FABRICATION +18 → "wastage" PERCENT ×1.02 (i.e. +2%) → "margin" FIXED +9`
= ₹≈996/kg selling price.

## 4. Sell-side flow (points 3–4)

Mirrors the buy-side, reversed (we are the seller):
1. **Sell order** = a `SALE` booking, **linked to the source purchase** (`linked_booking_id`).
2. **We issue a PI to the customer** — a proforma document (mirrors the PO composer: our company
   as seller, customer block, line item, GST, amount-in-words), emailable/printable, recorded.
3. **Customer raises a PO** → captured in the **Sales inbox** (same parse+match+confirm pipeline,
   matched to the customer by email domain/keyword). Confirm logs the confirmed order.
4. **Release goods** (lifting/dispatch) → **tax invoice** → **payment received** (direction IN).
5. Customer **credit terms 30/60/90/120 days** (on the party record) set the invoice due date.

## 5. Collections & reminders (points 5–6)

- **Per-customer page** (`/sales/customers/[id]`): mirrors the supplier page — contact, all
  orders, liftings, invoices, payments settled/pending, running ledger, and this customer's
  profitability.
- **Collections tracker**: invoices due within 7 days / overdue.
- **In-app pop-up**: on load, a dismissible banner "₹X to collect from N customers this week"
  plus entries in the existing alerts list (critical when overdue).
- **Email reminder**: a "Send reminder" action drafts/sends via the configured Gmail (mailto now,
  auto-send once the app password is set — same transport as the purchase inbox).

## 6. Basis-mismatch P&L (point 7)

Because each sale links to its source purchase, for every matched deal we know both sides'
**pricing basis** and **fixed rate**. Per deal:
`realized margin ₹/kg = sell_rate − buy_rate`, with the **buy basis** (e.g. MONTH_AVG from
Hindalco) and **sell basis** (e.g. DAY from the customer) shown side by side. When the basis
differs, we compute the **basis effect** — what the buy cost would have been on the sell basis —
and **flag** deals where the mismatch turned a positive quoted margin into a loss (or vice-versa).
Surfaced on the deal, the customer page, and as an alert.

## 7. Overheads & true profitability (points 8–9)

- **Expenses** (`/finance`): entries `{ month, category (salary/rent/power/…), amount, notes }`.
- **Overhead allocation**: total monthly overhead is spread across sales by **revenue share**
  (default; volume-share optional) for the month.
- **Profitability**:
  - *Gross* = Σ(sell − buy) over matched, priced, lifted deals.
  - *Net* = Gross − allocated overheads.
  - **Per customer** = that customer's gross − its overhead share.
  - **Overall net profitability** headline on the **Dashboard** (+ trend), with the per-customer
    breakdown on Dashboard and Finance.

## 8. Data model (idempotent migration)

New tables:
- `price_templates(id, name, notes, created_date)`
- `price_lines(id, template_id, seq, label, kind, operator, value)`
- `sale_products(id, customer_id, name, raw_product_id, template_id, fabrication_cost, notes, active, created_date)`
- `sales_pi(id, pi_no, customer_id, sale_product_id, booking_id, qty_mt, rate_inr_kg, base_amount, tax_amount, gross_amount, basis, status['SENT'|'CANCELLED'], created_date, cancelled_date)`
- `expenses(id, month, category, amount, notes, created_date)`

Reused: `parties` (CUSTOMER, credit_days, email/keywords), `bookings` (SALE + linked_booking_id),
`price_fixations`, `liftings`, `invoices` (SALE), `payments` (IN), `email_captures` (customer POs),
the PI/PO document + amount-in-words engine (`lib/po.ts`), alerts, the pricing formula.
No numbered SQL params (Node 22).

## 9. Phase plan (reviewable commits)

- **S1 — Nav + section hubs:** Dashboard/Purchase/Sales/Finance/Settings; regroup existing
  buy-side under Purchase; Sales → Customers list; migration for all new tables.
- **S2 — Products & pricing templates:** template builder (ordered lines + operators, live
  preview), sale products per customer, reusable templates.
- **S3 — Sell-order flow:** SALE order linked to a purchase; **customer PI** composer/document;
  **Sales inbox** (customer PO capture → confirm); invoice + dispatch.
- **S4 — Customer page + collections:** per-customer history/ledger; collections tracker; in-app
  pop-up; email reminder (Gmail-gated).
- **S5 — Basis-mismatch P&L:** per-deal buy-vs-sell basis, basis-effect, loss flag + alert.
- **S6 — Finance & profitability:** expenses page; overhead allocation; overall + per-customer
  net profitability on the Dashboard and Finance.

Each phase: verified in the browser, `vitest` + `tsc` + build green, pushed.

## 10. Caveats

1. **Email reminders / customer-PO auto-pull** ride on the Gmail app password (Settings) — built
   fully; live send/pull activates when the credential is entered.
2. Fabrication is priced, not physically converted (no yield/scrap) — by decision; addable later.
3. Overhead allocation uses revenue-share by default; the method is a setting.
