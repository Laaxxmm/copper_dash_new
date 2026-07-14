// Control-plane database — one SQLite file holding cross-client data only:
// clients, users, feature flags, per-client config, audit log. Never business
// data (that lives in each client's own DB). Node runtime only.
import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { hashPassword } from './password';

function bizPath(): string {
  return process.env.DATABASE_PATH || join(process.cwd(), 'data', 'copper.db');
}
function controlPath(): string {
  return process.env.CONTROL_DB_PATH || join(dirname(bizPath()), 'control.db');
}

const CONTROL_TABLES = [
  `CREATE TABLE IF NOT EXISTS clients (
     id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE,
     status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','trial')),
     plan TEXT, db_path TEXT, created_date TEXT NOT NULL, expires_on TEXT, notes TEXT)`,
  `CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY, client_id INTEGER REFERENCES clients(id),
     username TEXT UNIQUE NOT NULL, email TEXT, password_hash TEXT NOT NULL, salt TEXT NOT NULL,
     role TEXT NOT NULL DEFAULT 'STAFF' CHECK (role IN ('SUPER_ADMIN','CLIENT_ADMIN','STAFF')),
     status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked')),
     perms_json TEXT, last_login TEXT, created_date TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS client_flags (client_id INTEGER NOT NULL, feature TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (client_id, feature))`,
  `CREATE TABLE IF NOT EXISTS client_config (client_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT, PRIMARY KEY (client_id, key))`,
  `CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY, at TEXT NOT NULL, actor_user_id INTEGER, client_id INTEGER, action TEXT NOT NULL, detail TEXT)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY, username TEXT, at TEXT NOT NULL, ok INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY, at TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'all', client_id INTEGER, message TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)`,
];

let cached: DatabaseSync | null = (globalThis as unknown as { __cbControl?: DatabaseSync }).__cbControl ?? null;

export function getControlDb(): DatabaseSync {
  if (cached) return cached;
  const path = controlPath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  for (const ddl of CONTROL_TABLES) db.prepare(ddl).run();
  seedControl(db);
  cached = db;
  (globalThis as unknown as { __cbControl?: DatabaseSync }).__cbControl = db;
  return db;
}

/** First boot: seed a SUPER_ADMIN from env (hashed) + a default client whose DB is the
 *  existing business file, so the current login keeps working and the data becomes client #1. */
function seedControl(db: DatabaseSync) {
  if (db.prepare(`SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1`).get()) return;
  const now = new Date().toISOString().slice(0, 10);
  const clientId = Number(db.prepare(
    `INSERT INTO clients (name, slug, status, plan, db_path, created_date) VALUES (?,?,?,?,?,?)`)
    .run('Default workspace', 'default', 'active', 'full', bizPath(), now).lastInsertRowid);
  const { hash, salt } = hashPassword(process.env.ADMIN_PASSWORD || 'admin123');
  db.prepare(`INSERT INTO users (client_id, username, password_hash, salt, role, status, created_date) VALUES (?,?,?,?,?,?,?)`)
    .run(clientId, process.env.ADMIN_USER || 'admin', hash, salt, 'SUPER_ADMIN', 'active', now);
}

export type ControlUser = { id: number; client_id: number | null; username: string; email: string | null; role: string; status: string; perms_json: string | null };
type WithSecret = ControlUser & { password_hash: string; salt: string };

export function userByUsername(username: string): WithSecret | undefined {
  return getControlDb().prepare(`SELECT * FROM users WHERE username = ?`).get(username) as WithSecret | undefined;
}
export function userById(id: number): ControlUser | undefined {
  return getControlDb().prepare(`SELECT id, client_id, username, email, role, status, perms_json FROM users WHERE id = ?`).get(id) as ControlUser | undefined;
}
export function recordLoginAttempt(username: string, ok: boolean) {
  getControlDb().prepare(`INSERT INTO login_attempts (username, at, ok) VALUES (?,?,?)`).run(username, new Date().toISOString(), ok ? 1 : 0);
}
export function touchLastLogin(id: number) {
  getControlDb().prepare(`UPDATE users SET last_login = ? WHERE id = ?`).run(new Date().toISOString(), id);
}

/** Recent failed attempts for a username (simple lockout signal). */
export function recentFailures(username: string, minutes = 15): number {
  const since = new Date(Date.now() - minutes * 60000).toISOString();
  return (getControlDb().prepare(`SELECT COUNT(*) c FROM login_attempts WHERE username = ? AND ok = 0 AND at > ?`).get(username, since) as { c: number }).c;
}

export type ClientRow = { id: number; name: string; slug: string; status: string; plan: string | null; db_path: string | null; created_date: string; expires_on: string | null; users: number };
export function listClients(): ClientRow[] {
  return getControlDb().prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM users WHERE client_id = c.id) users FROM clients c ORDER BY c.id`).all() as ClientRow[];
}
export function clientById(id: number): ClientRow | undefined {
  return getControlDb().prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM users WHERE client_id = c.id) users FROM clients c WHERE c.id = ?`).get(id) as ClientRow | undefined;
}
export function listUsers(): (ControlUser & { client_name: string | null; last_login: string | null })[] {
  return getControlDb().prepare(
    `SELECT u.id, u.client_id, u.username, u.email, u.role, u.status, u.perms_json, u.last_login,
            (SELECT name FROM clients WHERE id = u.client_id) client_name
     FROM users u ORDER BY u.role, u.username`).all() as (ControlUser & { client_name: string | null; last_login: string | null })[];
}
