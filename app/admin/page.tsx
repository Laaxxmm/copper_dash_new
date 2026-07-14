import { withTenantPage } from '@/lib/tenant-resolve';
import { PageHead } from '@/components/ui';
import { requireSuperAdmin } from '@/lib/current-user';
import { listClients, listUsers } from '@/lib/control-db';
import { createClientAction, suspendClient, enableClient, deleteClientAction } from '@/lib/client-actions';
import { dateShort } from '@/lib/format';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'Super admin', CLIENT_ADMIN: 'Client admin', STAFF: 'Staff' };

async function AdminPage({ searchParams }: { searchParams: Promise<{ err?: string; done?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const clients = listClients();
  const users = listUsers();

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

      <div className="help"><b>Next:</b> per-client user seats, feature toggles, and each client&apos;s live-price feed and news — all from here.</div>
    </>
  );
}

export default withTenantPage(AdminPage);
