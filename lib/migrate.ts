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

  const insP = db.prepare(`INSERT OR IGNORE INTO products (type, size_mm, description) VALUES (?,?,?)`);
  for (const p of WIRE_ROD) insP.run(p[0], p[1], p[2]);
}
