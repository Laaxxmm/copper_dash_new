// Phase 1 schema additions — idempotent so a deployed volume database upgrades
// in place. Kept dependency-free (only a type import) so both the app (lib/db)
// and the `npm run seed` CLI can import it without a bundler.
import type { DatabaseSync } from 'node:sqlite';

export const WIRE_ROD: [string, number, string][] = [
  ['WIRE', 1.38, '1.38 mm EC CU wire'], ['WIRE', 1.6, '1.60 mm EC CU wire'],
  ['WIRE', 2.5, '2.50 mm EC CU wire'], ['WIRE', 3.35, '3.35 mm EC CU wire'],
  ['WIRE', 5.75, '5.75 mm EC CU wire'], ['ROD', 8, '8 mm CC copper rod'],
  ['ROD', 12.5, '12.5 mm CC copper rod'],
];

const PHASE1_TABLES = [
  `CREATE TABLE IF NOT EXISTS products (
     id INTEGER PRIMARY KEY,
     type TEXT NOT NULL CHECK (type IN ('WIRE','ROD')),
     size_mm REAL NOT NULL,
     description TEXT NOT NULL,
     UNIQUE(type, size_mm))`,
  `CREATE TABLE IF NOT EXISTS supplier_terms (
     id INTEGER PRIMARY KEY,
     supplier_id INTEGER NOT NULL REFERENCES parties(id),
     product_id INTEGER NOT NULL REFERENCES products(id),
     premium_usd_mt REAL NOT NULL DEFAULT 0,
     transaction_usd_mt REAL NOT NULL DEFAULT 0,
     factor_pct REAL NOT NULL DEFAULT 0,
     handling_inr_mt REAL NOT NULL DEFAULT 0,
     delivery_days INTEGER,
     credit_days INTEGER,
     UNIQUE(supplier_id, product_id))`,
  `CREATE TABLE IF NOT EXISTS lme_prices (
     price_date TEXT PRIMARY KEY,
     usd_mt REAL NOT NULL,
     source TEXT DEFAULT 'manual')`,
  `CREATE TABLE IF NOT EXISTS fx_rates (
     rate_date TEXT NOT NULL,
     basis TEXT NOT NULL CHECK (basis IN ('RBI_TT','SBI_TT')),
     usd_inr REAL NOT NULL,
     PRIMARY KEY (rate_date, basis))`,
  // Phase 2 — a monthly requirement, split into supplier allocations.
  `CREATE TABLE IF NOT EXISTS requirements (
     id INTEGER PRIMARY KEY,
     req_no TEXT NOT NULL UNIQUE,
     customer_id INTEGER REFERENCES parties(id),
     product_id INTEGER NOT NULL REFERENCES products(id),
     qty_mt REAL NOT NULL,
     need_by_date TEXT,
     target_sell_inr_kg REAL,
     status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIAL','FILLED','CANCELLED')),
     created_date TEXT NOT NULL,
     notes TEXT)`,
  `CREATE TABLE IF NOT EXISTS allocations (
     id INTEGER PRIMARY KEY,
     requirement_id INTEGER NOT NULL REFERENCES requirements(id),
     supplier_id INTEGER NOT NULL REFERENCES parties(id),
     tier_label TEXT,
     qty_mt REAL NOT NULL,
     rate_inr_kg REAL,
     booking_id INTEGER REFERENCES bookings(id),
     status TEXT NOT NULL DEFAULT 'ENQUIRY'
       CHECK (status IN ('ENQUIRY','PI_RECEIVED','PO_SENT','PAID','DISPATCHED','RECEIVED','CANCELLED')),
     created_date TEXT NOT NULL,
     notes TEXT)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
  // Revamp — monthly per-supplier, per-product tonnage plan (target vs agreed; lifted is derived).
  `CREATE TABLE IF NOT EXISTS supplier_targets (
     id INTEGER PRIMARY KEY,
     supplier_id INTEGER NOT NULL REFERENCES parties(id),
     product_id INTEGER NOT NULL REFERENCES products(id),
     month TEXT NOT NULL,
     target_mt REAL NOT NULL DEFAULT 0,
     agreed_mt REAL NOT NULL DEFAULT 0,
     UNIQUE(supplier_id, product_id, month))`,
  // Revamp — purchase orders we issue to suppliers (gross = committed cost of purchase).
  `CREATE TABLE IF NOT EXISTS purchase_orders (
     id INTEGER PRIMARY KEY,
     po_no TEXT NOT NULL UNIQUE,
     supplier_id INTEGER NOT NULL REFERENCES parties(id),
     product_id INTEGER REFERENCES products(id),
     month TEXT,
     qty_mt REAL NOT NULL,
     rate_inr_kg REAL NOT NULL,
     base_amount REAL NOT NULL,
     tax_amount REAL NOT NULL DEFAULT 0,
     gross_amount REAL NOT NULL,
     lme_usd REAL, fx_rate REAL, basis TEXT,
     status TEXT NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENT','CANCELLED')),
     created_date TEXT NOT NULL,
     cancelled_date TEXT,
     capture_id INTEGER REFERENCES email_captures(id))`,
  // Phase 4 — inbound documents parsed from email, awaiting human confirmation.
  `CREATE TABLE IF NOT EXISTS email_captures (
     id INTEGER PRIMARY KEY,
     received_at TEXT NOT NULL,
     doc_type TEXT CHECK (doc_type IN ('PI','PO','INVOICE','CANCEL','UNKNOWN')),
     reference_no TEXT,
     matched_allocation_id INTEGER REFERENCES allocations(id),
     matched_requirement_id INTEGER REFERENCES requirements(id),
     extracted_json TEXT,
     status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','MISMATCH','CONFIRMED','REJECTED')),
     raw_ref TEXT)`,
];

export function migrate(db: DatabaseSync) {
  for (const ddl of PHASE1_TABLES) db.prepare(ddl).run();

  const colset = (t: string) =>
    new Set((db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((r) => r.name));

  const bc = colset('bookings');
  for (const [name, ddl] of [
    ['premium_usd_mt', 'REAL DEFAULT 0'], ['transaction_usd_mt', 'REAL DEFAULT 0'],
    ['factor_pct', 'REAL DEFAULT 0'], ['handling_inr_mt', 'REAL DEFAULT 0'], ['product_id', 'INTEGER'],
  ] as [string, string][]) {
    if (!bc.has(name)) db.prepare(`ALTER TABLE bookings ADD COLUMN ${name} ${ddl}`).run();
  }
  if (!colset('parties').has('exchange_basis')) {
    db.prepare(`ALTER TABLE parties ADD COLUMN exchange_basis TEXT DEFAULT 'RBI_TT'`).run();
  }
  if (!colset('parties').has('email')) db.prepare(`ALTER TABLE parties ADD COLUMN email TEXT`).run();
  if (!colset('parties').has('manual_rank')) db.prepare(`ALTER TABLE parties ADD COLUMN manual_rank INTEGER`).run();
  if (!colset('parties').has('mail_keywords')) db.prepare(`ALTER TABLE parties ADD COLUMN mail_keywords TEXT`).run();
  if (!colset('supplier_terms').has('default_basis')) db.prepare(`ALTER TABLE supplier_terms ADD COLUMN default_basis TEXT DEFAULT 'DAY'`).run();
  if (colset('email_captures').size && !colset('email_captures').has('matched_supplier_id')) db.prepare(`ALTER TABLE email_captures ADD COLUMN matched_supplier_id INTEGER`).run();
  if (colset('email_captures').size && !colset('email_captures').has('matched_product_id')) db.prepare(`ALTER TABLE email_captures ADD COLUMN matched_product_id INTEGER`).run();
  if (colset('allocations').size && !colset('allocations').has('sent_at')) db.prepare(`ALTER TABLE allocations ADD COLUMN sent_at TEXT`).run();

  const insP = db.prepare(`INSERT OR IGNORE INTO products (type, size_mm, description) VALUES (?,?,?)`);
  for (const p of WIRE_ROD) insP.run(p[0], p[1], p[2]);
}
