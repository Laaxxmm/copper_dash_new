import { PageHead } from '@/components/ui';
import { requireSuperAdmin } from '@/lib/current-user';
import { listClients, listUsers } from '@/lib/control-db';
import { dateShort } from '@/lib/format';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'Super admin', CLIENT_ADMIN: 'Client admin', STAFF: 'Staff' };

export default async function AdminPage() {
  await requireSuperAdmin();
  const clients = listClients();
  const users = listUsers();

  return (
    <>
      <PageHead title="Admin console" sub="Clients, users and access across the whole platform. Provisioning and per-client controls arrive in the next updates." />

      <div className="grid tiles">
        <div className="card tile accent"><div className="t-label">Clients</div><div className="t-value">{clients.length}</div><div className="t-note">{clients.filter((c) => c.status === 'active').length} active</div></div>
        <div className="card tile"><div className="t-label">Users</div><div className="t-value">{users.length}</div><div className="t-note">across all clients</div></div>
        <div className="card tile"><div className="t-label">Suspended</div><div className="t-value">{clients.filter((c) => c.status === 'suspended').length}</div><div className="t-note">clients on hold</div></div>
      </div>

      <div className="section-gap">
        <div className="section-title">Clients</div>
        <div className="card"><div className="table-wrap">
          <table className="data">
            <thead><tr><th>Client</th><th>Status</th><th>Plan</th><th>Users</th><th>Created</th></tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td className="cell-main">{c.name}<div className="cell-sub mono-sm">{c.slug}</div></td>
                  <td><span className={`spill ${c.status === 'active' ? 'good' : c.status === 'suspended' ? 'bad' : 'warn'}`}>{c.status}</span></td>
                  <td>{c.plan ?? '—'}</td>
                  <td>{c.users}</td>
                  <td>{dateShort(c.created_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
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

      <div className="help"><b>Next:</b> create clients (each gets its own database), manage their users and seats, toggle features, and set each client&apos;s live-price feed and news — all from here.</div>
    </>
  );
}
