# CopperBook

A dead-simple trade register and dashboard for a mid-size copper business: bookings, price fixations, trucks, supplier/customer bills, payments and profitability — everything the business currently tracks manually, in one place.

Built on the trade model documented in [research/copper-industry-analysis.md](research/copper-industry-analysis.md): **booking, pricing and lifting are three separate dated events against a contract balance**, and unpriced quantity is live market risk.

## Run it

```bash
npm install
npm run seed     # rebuilds data/copper.db with 6 months of realistic demo trade
npm run dev      # http://localhost:3000
```

## Structure

```
db/
  schema.sql            # the data model — read this first
  seed.mjs              # deterministic demo data (6 months of trade)
data/
  copper.db             # SQLite database (generated; node:sqlite, no native deps)
lib/
  db.ts                 # database access (singleton)
  queries.ts            # every business question the UI asks, as SQL
  actions.ts            # server actions behind the Add entry forms
  market.ts             # live COMEX copper + USD/INR (Yahoo) & copper news (Google News RSS)
  format.ts             # ₹ lakh/crore, MT, dates, plain-language labels
app/
  page.tsx              # Today    — money in/out, material moving, price risk, alerts
  bookings/             # Bookings — deals with progress bars: priced / moved
  trucks/               # Trucks   — e-way bills, arrival, unloading, weight checks
  money/                # Money    — bills, payments with UTR, receivable aging
  profit/               # Profit   — matched-deal margins, monthly bought vs sold
  parties/              # People   — suppliers & customers; per-party orders + ledger
  news/                 # Market & news — live COMEX/USD-INR + copper headlines
  add/                  # Add entry — all data-entry forms (incl. new customer/supplier)
components/
  ui.tsx                # tiles, badges, booking pipeline, page header
  charts/               # price line + bought/sold bars (palette validated for CVD)
research/
  copper-industry-analysis.md   # verified industry research this app is derived from
```

## The data model in one paragraph

A **booking** is a commitment for a quantity with a party, with a *pricing basis* (day price, week/15-day/month average, fixed, or price-later). **Price fixations** attach rates to portions of the booking — until then that quantity is exposure. **Liftings** are truck movements against the booking (e-way bill, challan, weighbridge weights, arrival, unloading). Every lifting produces an **invoice** (with GST), and **payments** (RTGS/NEFT/UPI/cheque with UTR) settle invoices. Sale bookings can be linked back-to-back to purchase bookings; profit is the rate gap on linked, priced deals. Nothing is stored twice — every dashboard number is computed from these five event tables.

## Daily use

Everything is entered on **Add entry** (`/add`) the moment it happens — it works from a phone:

1. **Morning**: save today's copper price (producer circular / broker message).
2. **A deal is agreed** → *New booking* (buy or sell, quantity, how the price is decided, premium).
3. **A rate is fixed** (for price-later or average deals) → *Fix a price*.
4. **A truck leaves** → *Truck dispatched* — the bill (with GST and due date from the party's credit terms) is created automatically at the fixed rate, or provisionally at today's price + premium if unpriced.
5. **A truck reaches / is emptied** → *Truck arrived / unloaded* with the received weight — shortages are flagged automatically.
6. **Money moves** → *Payment* against a bill; bank transfers require the UTR (that's what ends "we already paid" disputes).

Bookings finish themselves once fully priced and fully moved. Every screen recomputes from the database on load, so whoever opens the Today page sees the true position.

## Deploy on Railway (recommended)

The repo is Railway-ready ([railway.toml](railway.toml)). Steps:

1. Push this folder to a GitHub repo → Railway → **New Project → Deploy from GitHub**.
2. Add a **Volume** to the service, mount path `/data` — the SQLite database lives there and survives every deploy.
3. Set variables: `DATABASE_PATH=/data/copper.db` and `NIXPACKS_NODE_VERSION=22`.
4. **Settings → Networking → Generate Domain** — that URL works from any phone or laptop.

On first boot the app creates its schema and loads demo data so there's something to see. Sign in, explore, then **Settings → Erase all data** to start your real register clean. Set `SEED_DEMO=off` to boot empty instead. Backup = download the volume file, or a scheduled job copying `/data/copper.db`.

**Login** is required (gated by middleware). Defaults are `admin` / `admin123` — override with env vars:

| Variable | Purpose | Default |
|---|---|---|
| `ADMIN_USER` / `ADMIN_PASSWORD` | Login credentials | `admin` / `admin123` |
| `AUTH_SECRET` | Signs the session cookie (set a long random string) | dev fallback |
| `SEED_DEMO` | `off` = boot with an empty register | seed on |

## Reports

The **Reports** page exports any register as a real `.xlsx` (Excel/Google Sheets) for a chosen period: bookings, bills, payments, trucks, profit — or everything in one 5-sheet workbook. Party account statements download from each party's page. All served by [app/api/report/route.ts](app/api/report/route.ts).

## Access from anywhere

The app is a normal web server + one SQLite file, so the simplest production setup is a small always-on VPS (e.g. Lightsail/DigitalOcean/Hetzner, ~₹400–800/month):

```bash
npm run build && npm run start   # behind nginx/caddy with HTTPS
```

Staff and the owner then use it from any phone/laptop browser via the URL. Back up `data/copper.db` daily (it's a single file — `sqlite3 data/copper.db ".backup backup-$(date +%F).db"` in a cron job). For a private-only setup, run it on an office machine with Tailscale and share the tailnet URL. If you'd rather deploy serverless (Vercel), swap `lib/db.ts` for a hosted SQLite (Turso) or Postgres — the queries are plain SQL and port directly. Add login before exposing it to the internet.

## Design

Warm paper-ledger aesthetic (Fraunces / Hanken Grotesk / Spline Sans Mono), plain-language labels ("They owe us", "Waiting to unload", "Quantity without a price"), and a help note on every page explaining how to read it. Chart palette passes colorblind-safety validation.
