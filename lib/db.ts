import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { seedDemo } from './seed';
import { migrate } from './migrate';
import { currentTenant } from './tenant';

export { migrate };

// One handle per business-DB path, cached on globalThis so Next.js dev
// hot-reloads (and every request) reuse connections instead of leaking a file
// handle per reload. Multi-tenant: each client's DB is a separate entry.
const g = globalThis as typeof globalThis & { __copperDbs?: Map<string, DatabaseSync> };

// DATABASE_PATH lets hosted deployments (e.g. a Railway volume mounted at /data)
// keep the database outside the app directory. Resolved lazily so tests can
// point at a temp file before first use.
function dbPath(): string {
  return process.env.DATABASE_PATH || join(process.cwd(), 'data', 'copper.db');
}

export function applySchema(db: DatabaseSync, schemaFile = join(process.cwd(), 'db', 'schema.sql')) {
  const schemaSql = readFileSync(schemaFile, 'utf8');
  for (const raw of schemaSql.split(';')) {
    const stmt = raw.replace(/--[^\n]*/g, '').trim();
    if (!stmt) continue;
    if (stmt.toUpperCase().startsWith('PRAGMA')) db.prepare(stmt).get();
    else db.prepare(stmt).run();
  }
}

/** Open (creating + migrating + optionally seeding a fresh file) a business DB. */
export function openBusinessDb(path: string, seed = process.env.SEED_DEMO !== 'off'): DatabaseSync {
  const isNew = !existsSync(path);
  if (isNew) mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.prepare('PRAGMA journal_mode = WAL').get();
  db.prepare('PRAGMA foreign_keys = ON').run();
  // Fresh file: create the schema and (unless told not to) load demo data so the
  // client opens with something to look at. Settings can erase it to start clean.
  if (isNew) applySchema(db);
  migrate(db); // idempotent — brings existing databases up to the current shape
  if (isNew && seed) {
    try { seedDemo(db); } catch (e) { console.error('Demo seed failed:', e); }
  }
  return db;
}

export function getDb(): DatabaseSync {
  const path = currentTenant()?.dbPath ?? dbPath();
  const map = (g.__copperDbs ??= new Map());
  let db = map.get(path);
  if (!db) { db = openBusinessDb(path); map.set(path, db); }
  return db;
}

/** Close and forget cached connections (used by tests). */
export function closeDb() {
  for (const db of g.__copperDbs?.values() ?? []) db.close();
  g.__copperDbs = undefined;
}

// node:sqlite returns null-prototype rows; copy to plain objects so they can
// cross the server/client component boundary.
export function all<T = Record<string, unknown>>(sql: string, ...params: (string | number)[]): T[] {
  return (getDb().prepare(sql).all(...params) as T[]).map((r) => ({ ...r }));
}

export function get<T = Record<string, unknown>>(sql: string, ...params: (string | number)[]): T | undefined {
  const row = getDb().prepare(sql).get(...params) as T | undefined;
  return row ? { ...row } : undefined;
}

export function run(sql: string, ...params: (string | number | null)[]) {
  return getDb().prepare(sql).run(...params);
}
