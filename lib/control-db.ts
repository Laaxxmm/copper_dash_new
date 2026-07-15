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
export function clientBySlug(slug: string): ClientRow | undefined {
  return getControlDb().prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM users WHERE client_id = c.id) users FROM clients c WHERE c.slug = ?`).get(slug) as ClientRow | undefined;
}

// ---------- provisioning + lifecycle (G2) ----------
/** Each client's business DB lives beside the default one, under tenants/. */
export function tenantDbPath(id: number): string {
  return join(dirname(bizPath()), 'tenants', `client-${id}.db`);
}

export function auditLog(actorUserId: number | null, clientId: number | null, action: string, detail?: string) {
  getControlDb().prepare(`INSERT INTO audit_log (at, actor_user_id, client_id, action, detail) VALUES (?,?,?,?,?)`)
    .run(new Date().toISOString(), actorUserId, clientId, action, detail ?? null);
}

/** Insert a client row and stamp its dedicated business-DB path (needs the id first). */
export function createClient(opts: { name: string; slug: string; plan?: string }): number {
  const db = getControlDb();
  const now = new Date().toISOString().slice(0, 10);
  const id = Number(db.prepare(
    `INSERT INTO clients (name, slug, status, plan, db_path, created_date) VALUES (?,?,?,?,?,?)`)
    .run(opts.name, opts.slug, 'active', opts.plan ?? 'full', null, now).lastInsertRowid);
  db.prepare(`UPDATE clients SET db_path = ? WHERE id = ?`).run(tenantDbPath(id), id);
  return id;
}

export function createUser(opts: { clientId: number | null; username: string; email?: string | null; password: string; role: string }): number {
  const { hash, salt } = hashPassword(opts.password);
  const now = new Date().toISOString().slice(0, 10);
  return Number(getControlDb().prepare(
    `INSERT INTO users (client_id, username, email, password_hash, salt, role, status, created_date) VALUES (?,?,?,?,?,?,?,?)`)
    .run(opts.clientId, opts.username, opts.email ?? null, hash, salt, opts.role, 'active', now).lastInsertRowid);
}

export function setClientStatus(id: number, status: 'active' | 'suspended') {
  getControlDb().prepare(`UPDATE clients SET status = ? WHERE id = ?`).run(status, id);
}

/** Remove a client and its control-plane rows. The business DB file is left on
 *  disk (never auto-deleted) so data can be recovered; the caller may remove it. */
export function deleteClientRow(id: number) {
  const db = getControlDb();
  for (const t of ['users', 'client_flags', 'client_config']) db.prepare(`DELETE FROM ${t} WHERE client_id = ?`).run(id);
  db.prepare(`DELETE FROM clients WHERE id = ?`).run(id);
}

// ---------- per-client users + config (G3) ----------
export type ClientUserRow = { id: number; username: string; email: string | null; role: string; status: string; last_login: string | null; created_date: string };
export function usersByClient(clientId: number): ClientUserRow[] {
  return getControlDb().prepare(
    `SELECT id, username, email, role, status, last_login, created_date FROM users WHERE client_id = ? ORDER BY role, username`).all(clientId) as ClientUserRow[];
}
export function setUserStatus(id: number, status: 'active' | 'locked') {
  getControlDb().prepare(`UPDATE users SET status = ? WHERE id = ?`).run(status, id);
}
export function setUserRole(id: number, role: string) {
  getControlDb().prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, id);
}
export function updateUserPassword(id: number, password: string) {
  const { hash, salt } = hashPassword(password);
  getControlDb().prepare(`UPDATE users SET password_hash = ?, salt = ? WHERE id = ?`).run(hash, salt, id);
}
export function deleteUser(id: number) {
  getControlDb().prepare(`DELETE FROM users WHERE id = ?`).run(id);
}

export function clientConfig(clientId: number, key: string): string | undefined {
  return (getControlDb().prepare(`SELECT value FROM client_config WHERE client_id = ? AND key = ?`).get(clientId, key) as { value: string } | undefined)?.value;
}
export function setClientConfig(clientId: number, key: string, value: string) {
  getControlDb().prepare(
    `INSERT INTO client_config (client_id, key, value) VALUES (?,?,?)
     ON CONFLICT(client_id, key) DO UPDATE SET value = excluded.value`).run(clientId, key, value);
}
/** Seat limit for a client (default 5). */
export function seatLimit(clientId: number): number {
  return Number(clientConfig(clientId, 'seats') ?? 5) || 5;
}

// ---------- per-client features + data sources + branding (G4) ----------
/** Feature keys explicitly turned OFF for a client (absent = on). */
export function disabledFeatures(clientId: number): string[] {
  return (getControlDb().prepare(`SELECT feature FROM client_flags WHERE client_id = ? AND enabled = 0`).all(clientId) as { feature: string }[]).map((r) => r.feature);
}
export function setFeature(clientId: number, feature: string, enabled: boolean) {
  getControlDb().prepare(
    `INSERT INTO client_flags (client_id, feature, enabled) VALUES (?,?,?)
     ON CONFLICT(client_id, feature) DO UPDATE SET enabled = excluded.enabled`).run(clientId, feature, enabled ? 1 : 0);
}

export type ClientSettings = { disabled: string[]; priceSource: string; newsKeywords: string; brandName: string; brandAccent: string };
export function clientSettings(clientId: number): ClientSettings {
  return {
    disabled: disabledFeatures(clientId),
    priceSource: clientConfig(clientId, 'price_source') ?? 'LME',
    newsKeywords: clientConfig(clientId, 'news_keywords') ?? '',
    brandName: clientConfig(clientId, 'brand_name') ?? '',
    brandAccent: clientConfig(clientId, 'brand_accent') ?? '',
  };
}
/** Defaults for a session with no client (global super-admin): everything on. */
export const DEFAULT_SETTINGS: ClientSettings = { disabled: [], priceSource: 'LME', newsKeywords: '', brandName: '', brandAccent: '' };

// ---------- audit log + announcements (G5) ----------
export type AuditRow = { id: number; at: string; actor: string | null; client_name: string | null; action: string; detail: string | null };
/** Recent audit entries with actor + client names resolved. Optional clientId filter. */
export function recentAudit(limit = 30, clientId?: number): AuditRow[] {
  const where = clientId ? `WHERE a.client_id = ?` : '';
  const p = clientId ? [clientId, limit] : [limit];
  return getControlDb().prepare(
    `SELECT a.id, a.at, u.username actor, c.name client_name, a.action, a.detail
     FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id LEFT JOIN clients c ON c.id = a.client_id
     ${where} ORDER BY a.id DESC LIMIT ?`).all(...p) as AuditRow[];
}

export type Announcement = { id: number; at: string; scope: string; client_id: number | null; client_name: string | null; message: string; active: number };
export function listAnnouncements(): Announcement[] {
  return getControlDb().prepare(
    `SELECT a.*, c.name client_name FROM announcements a LEFT JOIN clients c ON c.id = a.client_id ORDER BY a.id DESC`).all() as Announcement[];
}
/** Active messages a given client should see (global + their own). */
export function activeAnnouncements(clientId: number | null): { id: number; message: string }[] {
  return getControlDb().prepare(
    `SELECT id, message FROM announcements WHERE active = 1 AND (scope = 'all' OR client_id = ?) ORDER BY id DESC`).all(clientId ?? -1) as { id: number; message: string }[];
}
export function createAnnouncement(scope: 'all' | 'client', clientId: number | null, message: string) {
  getControlDb().prepare(`INSERT INTO announcements (at, scope, client_id, message, active) VALUES (?,?,?,?,1)`)
    .run(new Date().toISOString(), scope, scope === 'client' ? clientId : null, message);
}
export function setAnnouncementActive(id: number, active: boolean) {
  getControlDb().prepare(`UPDATE announcements SET active = ? WHERE id = ?`).run(active ? 1 : 0, id);
}
export function listUsers(): (ControlUser & { client_name: string | null; last_login: string | null })[] {
  return getControlDb().prepare(
    `SELECT u.id, u.client_id, u.username, u.email, u.role, u.status, u.perms_json, u.last_login,
            (SELECT name FROM clients WHERE id = u.client_id) client_name
     FROM users u ORDER BY u.role, u.username`).all() as (ControlUser & { client_name: string | null; last_login: string | null })[];
}
