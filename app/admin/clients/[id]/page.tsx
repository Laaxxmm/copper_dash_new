import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withTenantPage } from '@/lib/tenant-resolve';
import { PageHead } from '@/components/ui';
import { requireSuperAdmin } from '@/lib/current-user';
import { statSync, existsSync } from 'node:fs';
import { clientById, usersByClient, seatLimit, clientSettings, listPlans, recordLimit } from '@/lib/control-db';
import {
  addClientUser, lockUser, unlockUser, resetUserPassword, changeUserRole, removeUser, setSeats,
  saveFeatures, saveClientData, assignPlanAction,
} from '@/lib/client-actions';
import { runWithTenant } from '@/lib/tenant';
import { businessUsage } from '@/lib/queries';
import { FEATURES, PRICE_SOURCES, ACCENTS } from '@/lib/features';
import { dateShort } from '@/lib/format';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'Super admin', CLIENT_ADMIN: 'Client admin', STAFF: 'Staff' };

async function ClientDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; done?: string }>;
}) {
  await requireSuperAdmin();
  const id = Number((await params).id);
  const sp = await searchParams;
  const client = clientById(id);
  if (!client) notFound();
  const users = usersByClient(id);
  const seats = seatLimit(id);
  const full = users.length >= seats;
  const settings = clientSettings(id);
  const plans = listPlans();
  const recLimit = recordLimit(id);
  // Usage: read the managed client's own DB (enter its tenant scope explicitly).
  const usage = client.db_path && existsSync(client.db_path)
    ? runWithTenant({ clientId: id, dbPath: client.db_path }, () => businessUsage())
    : { bookings: 0, parties: 0, invoices: 0, fixations: 0 };
  const dbKb = client.db_path && existsSync(client.db_path) ? Math.round(statSync(client.db_path).size / 1024) : 0;

  return (
    <>
      <PageHead title={client.name} sub={`Client workspace · ${users.length} of ${seats} seats used`} />

      {sp.err ? <div className="banner bad" style={{ marginBottom: 16 }}>{sp.err}</div> : null}
      {sp.done ? <div className="banner good" style={{ marginBottom: 16 }}>{sp.done}</div> : null}

      <div className="sup-head card card-pad">
        <div className="sup-id">
          <span className={`spill ${client.status === 'active' ? 'good' : client.status === 'suspended' ? 'bad' : 'warn'}`}>{client.status}</span>
          <span className="sup-contact">{client.slug} · {users.length}/{seats} seats · created {dateShort(client.created_date)}</span>
        </div>
        <div className="sup-actions">
          <form action={setSeats} className="seat-form">
            <input type="hidden" name="client_id" value={id} />
            <label>Seats <input name="seats" type="number" min={users.length || 1} max={100} defaultValue={seats} /></label>
            <button className="btn-xs">Save</button>
          </form>
          <Link href="/admin" className="btn-order outline">All clients</Link>
        </div>
      </div>

      <div className="grid two-col section-gap">
        <div>
          <div className="section-title">Users</div>
          <div className="card"><div className="table-wrap">
            <table className="data">
              <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead>
              <tbody>
                {users.map((u) => {
                  const superAdmin = u.role === 'SUPER_ADMIN';
                  return (
                    <tr key={u.id}>
                      <td className="cell-main">{u.username}{u.email ? <div className="cell-sub">{u.email}</div> : null}</td>
                      <td><span className="rank-pill">{ROLE_LABEL[u.role] ?? u.role}</span></td>
                      <td><span className={`spill ${u.status === 'active' ? 'good' : 'bad'}`}>{u.status}</span></td>
                      <td>{u.last_login ? dateShort(u.last_login.slice(0, 10)) : <span className="muted">never</span>}</td>
                      <td>
                        {superAdmin ? <span className="muted">—</span> : (
                          <div className="row-actions">
                            <form action={changeUserRole}>
                              <input type="hidden" name="client_id" value={id} /><input type="hidden" name="id" value={u.id} />
                              <input type="hidden" name="role" value={u.role === 'CLIENT_ADMIN' ? 'STAFF' : 'CLIENT_ADMIN'} />
                              <button className="btn-xs">{u.role === 'CLIENT_ADMIN' ? 'Make staff' : 'Make admin'}</button>
                            </form>
                            <form action={u.status === 'active' ? lockUser : unlockUser}>
                              <input type="hidden" name="client_id" value={id} /><input type="hidden" name="id" value={u.id} />
                              <button className="btn-xs">{u.status === 'active' ? 'Lock' : 'Unlock'}</button>
                            </form>
                            <form action={removeUser}>
                              <input type="hidden" name="client_id" value={id} /><input type="hidden" name="id" value={u.id} />
                              <button className="btn-xs danger">Remove</button>
                            </form>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div></div>

          <div className="section-title section-gap">Reset a password</div>
          <div className="card card-pad">
            <form action={resetUserPassword} className="reset-form">
              <input type="hidden" name="client_id" value={id} />
              <label className="fld">User
                <select name="id" defaultValue="">
                  <option value="" disabled>Choose a user…</option>
                  {users.filter((u) => u.role !== 'SUPER_ADMIN').map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
                </select>
              </label>
              <label className="fld">New temporary password
                <input name="password" required minLength={6} placeholder="6+ characters" autoComplete="new-password" />
              </label>
              <button className="btn-order" type="submit">Reset password</button>
            </form>
          </div>
        </div>

        <div>
          <div className="section-title">Add a user</div>
          <div className="card card-pad">
            {full ? (
              <p className="muted">All {seats} seats are in use. Raise the seat limit above to add more.</p>
            ) : (
              <form action={addClientUser} className="stack">
                <input type="hidden" name="client_id" value={id} />
                <label className="fld">Username
                  <input name="username" required placeholder="their login" autoComplete="off" />
                </label>
                <label className="fld">Email <span className="muted">(optional)</span>
                  <input name="email" type="email" placeholder="name@company.com" autoComplete="off" />
                </label>
                <label className="fld">Temporary password
                  <input name="password" required minLength={6} placeholder="6+ characters" autoComplete="new-password" />
                </label>
                <label className="fld">Role
                  <select name="role" defaultValue="STAFF">
                    <option value="STAFF">Staff</option>
                    <option value="CLIENT_ADMIN">Client admin</option>
                  </select>
                </label>
                <button className="btn-order" type="submit">Add user →</button>
                <p className="muted" style={{ margin: 0 }}>{seats - users.length} of {seats} seats free.</p>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="grid two-col section-gap">
        <div>
          <div className="section-title">Features</div>
          <div className="card card-pad">
            <form action={saveFeatures} className="stack">
              <input type="hidden" name="client_id" value={id} />
              {FEATURES.map((f) => (
                <label key={f.key} className="chk">
                  <input type="checkbox" name={`feat_${f.key}`} defaultChecked={!settings.disabled.includes(f.key)} />
                  <span><b>{f.label}</b><div className="muted" style={{ fontWeight: 400 }}>{f.desc}</div></span>
                </label>
              ))}
              <button className="btn-order" type="submit">Save features</button>
              <p className="muted" style={{ margin: 0 }}>Unchecked sections disappear from this client’s menu and their pages are blocked.</p>
            </form>
          </div>
        </div>

        <div>
          <div className="section-title">Data sources & branding</div>
          <div className="card card-pad">
            <form action={saveClientData} className="stack">
              <input type="hidden" name="client_id" value={id} />
              <label className="fld">Live price they see
                <select name="price_source" defaultValue={settings.priceSource}>
                  {PRICE_SOURCES.map((s) => <option key={s} value={s}>{s === 'MANUAL' ? 'Manual (entered rate)' : s}</option>)}
                </select>
              </label>
              <label className="fld">News keywords <span className="muted">(comma-separated; blank = all copper)</span>
                <input name="news_keywords" defaultValue={settings.newsKeywords} placeholder="copper, cathode, LME" autoComplete="off" />
              </label>
              <label className="fld">Brand name <span className="muted">(overrides their own)</span>
                <input name="brand_name" defaultValue={settings.brandName} placeholder="leave blank to use theirs" autoComplete="off" />
              </label>
              <label className="fld">Accent colour
                <select name="brand_accent" defaultValue={settings.brandAccent}>
                  <option value="">Use their own</option>
                  {ACCENTS.map((a) => <option key={a} value={a}>{a[0].toUpperCase() + a.slice(1)}</option>)}
                </select>
              </label>
              <button className="btn-order" type="submit">Save</button>
            </form>
          </div>
        </div>
      </div>

      <div className="section-gap">
        <div className="section-title">Usage</div>
        <div className="grid tiles">
          <div className="card tile"><div className="t-label">Users</div><div className="t-value">{users.length}<span className="muted" style={{ fontSize: 15 }}> / {seats}</span></div><div className="t-note">of seat limit</div></div>
          <div className="card tile"><div className="t-label">Orders</div><div className="t-value">{usage.bookings}{recLimit ? <span className="muted" style={{ fontSize: 15 }}> / {recLimit}</span> : null}</div><div className="t-note">{recLimit ? 'of record limit' : 'bookings'}</div></div>
          <div className="card tile"><div className="t-label">Parties</div><div className="t-value">{usage.parties}</div><div className="t-note">suppliers + customers</div></div>
          <div className="card tile"><div className="t-label">Database</div><div className="t-value">{dbKb >= 1024 ? `${(dbKb / 1024).toFixed(1)} MB` : `${dbKb} KB`}</div><div className="t-note">{usage.invoices} invoices · {usage.fixations} fixations</div></div>
        </div>
      </div>

      <div className="grid two-col section-gap">
        <div>
          <div className="section-title">Plan</div>
          <div className="card card-pad">
            <p className="muted" style={{ marginTop: 0 }}>Current plan: <b style={{ color: 'var(--ink)' }}>{client.plan ?? 'none'}</b>. Applying a plan sets this client&apos;s features, seat limit and record limit in one move.</p>
            {plans.length === 0 ? (
              <p className="muted">No plans defined yet. Create one on the <Link href="/admin" style={{ fontWeight: 700 }}>admin console</Link>.</p>
            ) : (
              <form action={assignPlanAction} className="seat-form" style={{ gap: 10 }}>
                <input type="hidden" name="client_id" value={id} />
                <select name="plan_id" defaultValue="" style={{ padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 9 }}>
                  <option value="" disabled>Choose a plan…</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button className="btn-order" type="submit">Apply plan</button>
              </form>
            )}
          </div>
        </div>

        <div>
          <div className="section-title">Backup</div>
          <div className="card card-pad">
            <p className="muted" style={{ marginTop: 0 }}>Download this client&apos;s entire database as a single file — a point-in-time backup you can keep or restore.</p>
            <a href={`/admin/clients/${id}/export`} className="btn-order" download>Download backup (.db)</a>
          </div>
        </div>
      </div>
    </>
  );
}

export default withTenantPage(ClientDetail);
