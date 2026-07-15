import Link from 'next/link';
import { withTenantPage } from '@/lib/tenant-resolve';
import { PageHead } from '@/components/ui';
import { requireSuperAdmin } from '@/lib/current-user';
import { listClients, listUsers, recentAudit, listAnnouncements, listPlans } from '@/lib/control-db';
import {
  createClientAction, suspendClient, enableClient, deleteClientAction,
  impersonateClient, postAnnouncement, removeAnnouncement,
  createPlanAction, deletePlanAction,
} from '@/lib/client-actions';
import { FEATURES } from '@/lib/features';
import { dateShort } from '@/lib/format';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'Super admin', CLIENT_ADMIN: 'Client admin', STAFF: 'Staff' };
const stamp = (iso: string) => iso.slice(0, 16).replace('T', ' ');

async function AdminPage({ searchParams }: { searchParams: Promise<{ err?: string; done?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const clients = listClients();
  const users = listUsers();
  const audit = recentAudit(25);
  const announcements = listAnnouncements();
  const plans = listPlans();

  return (
    <>
      <PageHead title="Admin console" sub="Every client is a separate database. Create one, manage access, put it on hold." />

      {sp.err ? <div className="banner bad" style={{ marginBottom: 16 }}>{sp.err}</div> : null}
      {sp.done ? <div className="banner good" style={{ marginBottom: 16 }}>{sp.done}</div> : null}

      <div className="grid tiles">
        <div className="card tile accent"><div className="t-label">Clients</div><div className="t-value">{clients.length}</div><div className="t-note">{clients.filter((c) => c.status === 'active').length} active</div></div>
        <div className="card tile"><div className="t-label">Users</div><div className="t-value">{users.length}</div><div className="t-note">across all clients</div></div>
        <div className="card tile"><div className="t-label">Suspended</div><div className="t-value">{clients.filter((c) => c.status === 'suspended').length}</div><div className="t-note">clients on hold</div></div>
      </div>

      <div className="grid two-col section-gap">
        <div>
          <div className="section-title">Clients</div>
          <div className="card"><div className="table-wrap">
            <table className="data">
              <thead><tr><th>Client</th><th>Status</th><th>Users</th><th>Created</th><th></th></tr></thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-main">{c.name}<div className="cell-sub mono-sm">{c.slug}</div></td>
                    <td><span className={`spill ${c.status === 'active' ? 'good' : c.status === 'suspended' ? 'bad' : 'warn'}`}>{c.status}</span></td>
                    <td>{c.users}</td>
                    <td>{dateShort(c.created_date)}</td>
                    <td>
                      <div className="row-actions">
                        <Link href={`/admin/clients/${c.id}`} className="btn-xs">Manage</Link>
                        {c.slug !== 'default'
                          ? <form action={impersonateClient}><input type="hidden" name="client_id" value={c.id} /><button className="btn-xs">Open</button></form>
                          : null}
                        {c.status === 'suspended'
                          ? <form action={enableClient}><input type="hidden" name="id" value={c.id} /><button className="btn-xs">Enable</button></form>
                          : <form action={suspendClient}><input type="hidden" name="id" value={c.id} /><button className="btn-xs" disabled={c.slug === 'default'}>Suspend</button></form>}
                        {c.slug !== 'default'
                          ? <form action={deleteClientAction}><input type="hidden" name="id" value={c.id} /><button className="btn-xs danger">Delete</button></form>
                          : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        </div>

        <div>
          <div className="section-title">New client</div>
          <div className="card card-pad">
            <form action={createClientAction} className="stack">
              <label className="fld">Company name
                <input name="name" required placeholder="e.g. Meridian Copper" />
              </label>
              <label className="fld">First admin — username
                <input name="admin_user" required placeholder="login for their admin" autoComplete="off" />
              </label>
              <label className="fld">Admin email <span className="muted">(optional)</span>
                <input name="admin_email" type="email" placeholder="name@company.com" autoComplete="off" />
              </label>
              <label className="fld">Temporary password
                <input name="admin_pass" required minLength={6} placeholder="6+ characters" autoComplete="new-password" />
              </label>
              <label className="chk"><input type="checkbox" name="seed" /> Load sample data to explore (otherwise start blank)</label>
              <button className="btn-order" type="submit">Create client →</button>
              <p className="muted" style={{ margin: 0 }}>A fresh database is created for this client. Nothing is shared with anyone else.</p>
            </form>
          </div>
        </div>
      </div>

      <div className="grid two-col section-gap">
        <div>
          <div className="section-title">Plans</div>
          <div className="card"><div className="table-wrap">
            <table className="data">
              <thead><tr><th>Plan</th><th>Features</th><th>Seats</th><th>Records</th><th></th></tr></thead>
              <tbody>
                {plans.length === 0 ? (
                  <tr><td colSpan={5} className="muted card-pad">No plans yet — create one to apply features + limits to clients in one move.</td></tr>
                ) : plans.map((p) => {
                  const feats = JSON.parse(p.features_json) as string[];
                  return (
                    <tr key={p.id}>
                      <td className="cell-main">{p.name}</td>
                      <td className="cell-sub">{feats.length ? FEATURES.filter((f) => feats.includes(f.key)).map((f) => f.label).join(', ') : 'core only'}</td>
                      <td>{p.seat_limit}</td>
                      <td>{p.record_limit || '∞'}</td>
                      <td><form action={deletePlanAction}><input type="hidden" name="id" value={p.id} /><button className="btn-xs danger">Delete</button></form></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div></div>
        </div>

        <div>
          <div className="section-title">New plan</div>
          <div className="card card-pad">
            <form action={createPlanAction} className="stack">
              <label className="fld">Plan name
                <input name="name" required placeholder="e.g. Starter, Pro" autoComplete="off" />
              </label>
              <div className="fld">Included features
                {FEATURES.map((f) => (
                  <label key={f.key} className="chk"><input type="checkbox" name={`feat_${f.key}`} defaultChecked /> {f.label}</label>
                ))}
              </div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label className="fld">Seat limit
                  <input name="seat_limit" type="number" min={1} max={1000} defaultValue={5} />
                </label>
                <label className="fld">Record limit <span className="muted">(0 = ∞)</span>
                  <input name="record_limit" type="number" min={0} defaultValue={0} />
                </label>
              </div>
              <button className="btn-order" type="submit">Create plan</button>
            </form>
          </div>
        </div>
      </div>

      <div className="section-gap">
        <div className="section-title">Users</div>
        <div className="card"><div className="table-wrap">
          <table className="data">
            <thead><tr><th>User</th><th>Client</th><th>Role</th><th>Status</th><th>Last login</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="cell-main">{u.username}{u.email ? <div className="cell-sub">{u.email}</div> : null}</td>
                  <td>{u.client_name ?? <span className="muted">— global —</span>}</td>
                  <td><span className="rank-pill">{ROLE_LABEL[u.role] ?? u.role}</span></td>
                  <td><span className={`spill ${u.status === 'active' ? 'good' : 'bad'}`}>{u.status}</span></td>
                  <td>{u.last_login ? dateShort(u.last_login.slice(0, 10)) : <span className="muted">never</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      </div>

      <div className="grid two-col section-gap">
        <div>
          <div className="section-title">Recent activity</div>
          <div className="card"><div className="table-wrap">
            <table className="data">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Client</th></tr></thead>
              <tbody>
                {audit.length === 0 ? (
                  <tr><td colSpan={4} className="muted card-pad">No activity yet.</td></tr>
                ) : audit.map((a) => (
                  <tr key={a.id}>
                    <td className="mono-sm">{stamp(a.at)}</td>
                    <td>{a.actor ?? <span className="muted">—</span>}</td>
                    <td><span className="mono-sm">{a.action}</span>{a.detail ? <div className="cell-sub">{a.detail}</div> : null}</td>
                    <td>{a.client_name ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        </div>

        <div>
          <div className="section-title">Announcements</div>
          <div className="card card-pad">
            <form action={postAnnouncement} className="stack">
              <label className="fld">Message
                <input name="message" required placeholder="e.g. Maintenance tonight 10–11pm" autoComplete="off" />
              </label>
              <label className="fld">Show to
                <select name="target" defaultValue="all">
                  <option value="all">Everyone</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name} only</option>)}
                </select>
              </label>
              <button className="btn-order" type="submit">Post</button>
              <p className="muted" style={{ margin: 0 }}>Shows as a banner across the top of the app until you remove it.</p>
            </form>
            {announcements.length ? (
              <div style={{ marginTop: 14 }}>
                {announcements.map((a) => (
                  <div key={a.id} className="ann-row">
                    <span className={`spill ${a.active ? 'good' : 'warn'}`}>{a.active ? 'live' : 'ended'}</span>
                    <span className="ann-msg">{a.message}<div className="cell-sub">{a.scope === 'all' ? 'everyone' : a.client_name ?? 'a client'} · {stamp(a.at)}</div></span>
                    {a.active ? <form action={removeAnnouncement}><input type="hidden" name="id" value={a.id} /><button className="btn-xs">End</button></form> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="help"><b>Tip:</b> <b>Open</b> lets you step into a client&apos;s workspace to see exactly what they see; a banner stays up until you stop. Every action here is logged in Recent activity.</div>
    </>
  );
}

export default withTenantPage(AdminPage);
