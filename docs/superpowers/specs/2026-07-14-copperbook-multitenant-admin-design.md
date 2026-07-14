# CopperBook — Multi-Tenant Platform + Global Admin (Design)

Date: 2026-07-14
Status: Draft for approval

## 1. Purpose

Turn CopperBook from a single-company tool into a **multi-tenant platform** with a
**super-admin** who provisions and controls every client. Each client gets an isolated
database. The super-admin toggles features and data sources per client, manages their users,
and grants/revokes access. Locked decisions: **database-per-client** isolation; **feature
toggles + limits now, billing later**; **extend the existing HMAC signed-cookie auth with
scrypt-hashed passwords + roles** (no new dependency).

## 2. Roles

- **SUPER_ADMIN** (global) — manages all clients, users, features, data sources; impersonation; audit. No business data of their own.
- **CLIENT_ADMIN** — owns one client; manages that client's users, company profile, appearance.
- **STAFF** — a client's user, with page/action permissions (view-only, no-erase, no-PO-send…).

## 3. Architecture

- **Control DB** — one SQLite file `/data/control.db`. Holds only cross-client data: clients,
  users, feature flags, per-client config, plans, audit log, announcements. **Never** business data.
- **Business DB per client** — `/data/tenants/<clientId>.db`, each with the full existing
  schema (parties, bookings, sales_pi, …). The current `copper.db` becomes client #1's DB.
- **Tenant resolution** — the session cookie (HMAC, edge+node) signs only `userId`. On each
  request the Node runtime resolves `user → client_id → status` from the control DB, and
  `getDb()` opens that client's business DB. Resolution uses `AsyncLocalStorage`
  (node:async_hooks) set per request; falls back to `DATABASE_PATH` when there's no context
  (CLI seed, tests) so existing behaviour is unchanged.
- **Auth** — login checks the control DB `users` (username/email + scrypt-hashed password).
  Middleware (edge) only verifies the signature for coarse gating; fine gating (super-admin
  area, locked/suspended status) is enforced server-side where the control DB is reachable.

## 4. Control-DB schema (idempotent migration, separate from business migrate)

- `clients(id, name, slug UNIQUE, status['active'|'suspended'|'trial'], plan, db_path,
   created_date, expires_on, notes)`
- `users(id, client_id NULL, username UNIQUE, email, password_hash, salt, role
   ['SUPER_ADMIN'|'CLIENT_ADMIN'|'STAFF'], status['active'|'locked'], perms_json,
   last_login, created_date)`  — client_id NULL only for SUPER_ADMIN
- `client_flags(client_id, feature, enabled)` — per-client feature on/off
- `client_config(client_id, key, value)` — price_source, fx_basis, news_keywords, timezone,
   currency, branding (logo/accent/name)
- `plans(id, name, features_json, seat_limit, record_limit)` — reusable flag bundles
- `login_attempts(username, at, ok)` — rate-limit / lockout
- `audit_log(id, at, actor_user_id, client_id, action, detail)`
- `announcements(id, at, scope['all'|'client'], client_id, message, active)`

## 5. Super-admin console (`/admin/*`, SUPER_ADMIN only)

- **Clients** — list (status, user count, last activity, DB size); **create** via a wizard
  (name, first admin, plan, seed-sample-or-blank → provisions the DB file + runs migrate);
  suspend / enable / delete; **Open as client** (impersonate, banner + audit).
- **Users** — per client: create up to the seat limit, set role + permissions, **lock/unlock**,
  reset password, force sign-out.
- **Features** — per-client flags, or assign a plan (bundle of flags + limits).
- **Data sources** — per-client **live price feed** (LME westmetall / COMEX / MCX / manual),
  **FX basis** (RBI/SBI/custom), **news** keywords & sources.
- **Audit** — filterable activity log. **Announcements** — push a banner to all/selected clients.

## 6. Feature flags & per-client config

- Flags gate **nav items + routes**: Purchase, Sales, Finance, PO composer, Supplier/Customer
  inbox, Margins, etc. A middleware/server check blocks a disabled route; the nav hides it.
- Config drives behaviour per client: `market.ts` reads `price_source` (which feed) and
  `news_keywords`; the pricing formula's default `fx_basis`; **branding** (logo/accent/name)
  reuses the existing Appearance engine; timezone/currency/number format.

## 7. Security (required once multi-user)

- **scrypt** password hashing (`node:crypto`), per-user salt; no plaintext anywhere.
- Session signs `userId` only; role/client/status resolved server-side each request — a
  tampered cookie can't elevate.
- **Login rate-limit + lockout** via `login_attempts`.
- Strict tenant resolution from the verified session, never from client input; a user can only
  ever open their own client's DB.
- Super-admin routes gated by role in middleware (coarse) **and** server (authoritative).
- Impersonation is logged and shows a persistent banner.

## 8. Additional capabilities (roadmap, beyond the core ask)

- **Audit log** + **impersonation** + **announcements** (G5).
- **Plans** as flag+limit bundles; **seat/record/storage limits**; **usage board** (G6).
- **Per-client backup & export** (download DB / Excel; scheduled) (G6).
- **White-label** per client (logo/accent/name) — reuses Appearance.
- **Template library** — push default products / pricing templates / supplier lists to new clients.
- **Notifications** — per-client Gmail/WhatsApp, reminder schedules, timezone.
- **Password reset / invites** (email, Gmail-gated); **2FA** and **billing** later.

## 9. Phased plan (each shippable, backward-compatible)

- **G1 — Foundation**: control DB; scrypt hashing; `users`/`clients`; login via the users
  table; `currentUser()` server resolution; seed SUPER_ADMIN from env (hashed) + a default
  client #1 pointing at the existing `copper.db`. Existing `admin/admin123` login keeps working.
  Minimal read-only `/admin` (clients + users) gated to SUPER_ADMIN.
- **G2 — Clients**: per-tenant DB resolution (AsyncLocalStorage); `getDb()` opens the client's
  DB; client provisioning (new `/data/tenants/<id>.db` + migrate + optional seed); create /
  suspend / enable / delete in `/admin`.
- **G3 — Users**: per-client user management, seats, lock/unlock, roles + granular permissions,
  password reset, force-logout.
- **G4 — Features + sources**: per-client flags & config; nav/route gating; price-feed & news
  per client; branding.
- **G5 — Trust**: audit log, impersonation, announcements.
- **G6 — Plans/limits**: tiers, seat/record limits + enforcement, usage board, export/backup.

## 10. Compatibility / migration

- First boot: create `control.db`; if no SUPER_ADMIN exists, seed one from
  `ADMIN_USER`/`ADMIN_PASSWORD` (hashed); create default client #1 with `db_path` = the
  existing `copper.db` (already migrated). The current login becomes the super-admin and the
  existing data becomes client #1 — **nothing breaks**.
- Tests & CLI seed keep using `DATABASE_PATH` directly (no tenant context) — unchanged.
- The whole app continues to work for client #1 throughout G1–G2; the console is additive.

## 11. Caveats

- The auth overhaul is security-critical — the current login must keep working at every step.
- Per-tenant DB resolution via AsyncLocalStorage is the one real engineering risk; proven in G2
  with a verification that two clients cannot see each other's data.
- Email (password reset, invites, announcements-by-mail) rides the Gmail transport (creds-gated).
- Railway volume holds `control.db` + `tenants/*.db`; back it up before enabling in production.
