-- CopperBook schema
-- Model (from industry research): a booking is a contract for quantity.
-- Pricing (fixation), lifting (dispatch/trucks) and money (invoices/payments)
-- are separate dated events recorded against the booking.
-- Unpriced quantity = live price exposure. Unlifted quantity = pending material.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS parties (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('SUPPLIER','CUSTOMER')),
  city          TEXT,
  contact_person TEXT,
  phone         TEXT,
  gstin         TEXT,
  credit_days   INTEGER NOT NULL DEFAULT 0,   -- 0 = advance payment
  notes         TEXT
);

-- Daily copper reference price (producer CSP, INR per MT)
CREATE TABLE IF NOT EXISTS csp_prices (
  price_date    TEXT PRIMARY KEY,             -- YYYY-MM-DD
  price_inr_mt  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id            INTEGER PRIMARY KEY,
  booking_no    TEXT NOT NULL UNIQUE,         -- PB-xxxx purchase / SB-xxxx sale
  kind          TEXT NOT NULL CHECK (kind IN ('PURCHASE','SALE')),
  party_id      INTEGER NOT NULL REFERENCES parties(id),
  booking_date  TEXT NOT NULL,
  qty_mt        REAL NOT NULL,
  -- How the price is decided:
  --   DAY_PRICE   : that day's CSP
  --   WEEK_AVG / FORTNIGHT_AVG / MONTH_AVG : average of CSP over the window
  --   FIXED       : negotiated fixed rate
  --   PRICE_LATER : material moves first, price fixed later (provisional)
  pricing_basis TEXT NOT NULL CHECK (pricing_basis IN
                  ('DAY_PRICE','WEEK_AVG','FORTNIGHT_AVG','MONTH_AVG','FIXED','PRICE_LATER')),
  premium_inr_mt REAL NOT NULL DEFAULT 0,     -- over reference price
  avg_start     TEXT,                         -- averaging window (average bases)
  avg_end       TEXT,
  lift_by_date  TEXT,                         -- material should be lifted by
  status        TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','CANCELLED')),
  linked_booking_id INTEGER REFERENCES bookings(id),  -- back-to-back: SALE -> PURCHASE
  notes         TEXT
);

-- Price fixation events. Sum(qty) <= booking.qty. Remaining qty is UNPRICED (exposure).
CREATE TABLE IF NOT EXISTS price_fixations (
  id            INTEGER PRIMARY KEY,
  booking_id    INTEGER NOT NULL REFERENCES bookings(id),
  fixation_date TEXT NOT NULL,
  qty_mt        REAL NOT NULL,
  price_inr_mt  REAL NOT NULL,                -- final rate incl. premium
  reference     TEXT NOT NULL DEFAULT 'CSP' CHECK (reference IN ('CSP','NEGOTIATED')),
  note          TEXT
);

-- Material movement events (a truck against a booking).
-- PURCHASE booking: truck coming to us. SALE booking: truck going to customer.
CREATE TABLE IF NOT EXISTS liftings (
  id            INTEGER PRIMARY KEY,
  booking_id    INTEGER NOT NULL REFERENCES bookings(id),
  dispatch_date TEXT NOT NULL,
  qty_mt        REAL NOT NULL,
  truck_no      TEXT,
  transporter   TEXT,
  driver_phone  TEXT,
  eway_bill_no  TEXT,
  challan_no    TEXT,
  dispatch_weight_kg REAL,
  received_weight_kg REAL,
  arrived_date  TEXT,
  unloaded_date TEXT,
  unloaded_by   TEXT,
  status        TEXT NOT NULL DEFAULT 'IN_TRANSIT'
                CHECK (status IN ('IN_TRANSIT','ARRIVED','UNLOADED')),
  note          TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id            INTEGER PRIMARY KEY,
  invoice_no    TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('PURCHASE','SALE')), -- payable / receivable
  party_id      INTEGER NOT NULL REFERENCES parties(id),
  booking_id    INTEGER REFERENCES bookings(id),
  lifting_id    INTEGER REFERENCES liftings(id),
  invoice_date  TEXT NOT NULL,
  qty_mt        REAL NOT NULL,
  rate_inr_mt   REAL NOT NULL,
  base_amount   REAL NOT NULL,
  gst_amount    REAL NOT NULL,                -- 18%
  total_amount  REAL NOT NULL,
  due_date      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY,
  direction     TEXT NOT NULL CHECK (direction IN ('IN','OUT')),   -- IN from customer, OUT to supplier
  party_id      INTEGER NOT NULL REFERENCES parties(id),
  invoice_id    INTEGER REFERENCES invoices(id),                   -- NULL = on-account
  payment_date  TEXT NOT NULL,
  amount        REAL NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('RTGS','NEFT','IMPS','UPI','CHEQUE','CASH')),
  utr_no        TEXT,
  bank          TEXT,
  note          TEXT
);

CREATE INDEX IF NOT EXISTS idx_bookings_party   ON bookings(party_id);
CREATE INDEX IF NOT EXISTS idx_fixations_booking ON price_fixations(booking_id);
CREATE INDEX IF NOT EXISTS idx_liftings_booking ON liftings(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_party   ON invoices(party_id);
CREATE INDEX IF NOT EXISTS idx_payments_party   ON payments(party_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
