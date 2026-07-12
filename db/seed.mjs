// CopperBook seed CLI — rebuilds data/copper.db from scratch with demo data.
// Run: npm run seed   (generation logic lives in lib/seed.ts, shared with the app)
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedDemo } from '../lib/seed.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dbDir = join(root, 'data');
const dbPath = join(dbDir, 'copper.db');
mkdirSync(dbDir, { recursive: true });
for (const suffix of ['', '-wal', '-shm']) {
  if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix);
}

const db = new DatabaseSync(dbPath);
const schemaSql = readFileSync(join(root, 'db', 'schema.sql'), 'utf8');
for (const raw of schemaSql.split(';')) {
  const stmt = raw.replace(/--[^\n]*/g, '').trim();
  if (!stmt) continue;
  if (stmt.toUpperCase().startsWith('PRAGMA')) db.prepare(stmt).get();
  else db.prepare(stmt).run();
}

seedDemo(db);

const counts = {};
for (const t of ['parties', 'csp_prices', 'bookings', 'price_fixations', 'liftings', 'invoices', 'payments']) {
  counts[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
}
console.log('Seeded', dbPath);
console.table(counts);
db.close();
