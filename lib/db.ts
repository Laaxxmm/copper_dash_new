import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// The handle is cached on globalThis so Next.js dev hot-reloads reuse one
// connection instead of leaking a new file handle per reload.
const g = globalThis as typeof globalThis & { __copperDb?: DatabaseSync };

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

export function getDb(): DatabaseSync {
  if (!g.__copperDb) {
    const path = dbPath();
    const isNew = !existsSync(path);
    if (isNew) mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    db.prepare('PRAGMA journal_mode = WAL').get();
    db.prepare('PRAGMA foreign_keys = ON').run();
    // First boot on a fresh volume: create the schema so the app starts empty
    // and ready for real entries. (Run `npm run seed` locally for demo data.)
    if (isNew) applySchema(db);
    g.__copperDb = db;
  }
  return g.__copperDb;
}

/** Close and forget the cached connection (used by tests). */
export function closeDb() {
  g.__copperDb?.close();
  g.__copperDb = undefined;
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
