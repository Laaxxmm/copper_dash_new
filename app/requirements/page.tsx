import { withTenantPage } from '@/lib/tenant-resolve';
import Link from 'next/link';
import { PageHead, Badge } from '@/components/ui';
import { requirements } from '@/lib/requirements';
import { dateShort, mt } from '@/lib/format';

export const dynamic = 'force-dynamic';

function StatusPill({ status }: { status: string }) {
  if (status === 'FILLED') return <Badge tone="good">Filled</Badge>;
  if (status === 'PARTIAL') return <Badge tone="warn">Partly sourced</Badge>;
  if (status === 'CANCELLED') return <Badge tone="bad">Cancelled</Badge>;
  return <Badge tone="copper">Open</Badge>;
}

function RequirementsPage() {
  const rows = requirements();
  return (
    <>
      <PageHead
        title="Requirements"
        sub="Each month's need, split across suppliers. See at a glance how much of every requirement is sourced and how much is still to buy."
      />
      <div className="pills">
        <Link href="/requirements/new" className="pill on">+ New requirement</Link>
      </div>

      {rows.length === 0 ? (
        <div className="help">No requirements yet. Create one — say 25 MT of 1.60 mm wire — then split it across L1, L2, L3 suppliers.</div>
      ) : (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Requirement</th>
                <th>For customer</th>
                <th>Product</th>
                <th className="num">Needed</th>
                <th>Sourced vs remaining</th>
                <th>Need by</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = Math.min(100, Math.round((r.sourced / r.qty_mt) * 100));
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/requirements/${r.id}`} className="cell-main mono" style={{ color: 'var(--copper-text)' }}>{r.req_no}</Link>
                      <div className="cell-sub">{dateShort(r.created_date)} · {r.alloc_count} supplier{r.alloc_count === 1 ? '' : 's'}</div>
                    </td>
                    <td>{r.customer ?? <span className="muted">stock</span>}</td>
                    <td>{r.product_desc}</td>
                    <td className="num"><b>{mt(r.qty_mt)}</b></td>
                    <td style={{ minWidth: 200 }}>
                      <div className="pipe-row">
                        <span className="pipe-bar" style={{ height: 9 }}>
                          <span className="pipe-fill" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--good)' : 'var(--copper)' }} />
                        </span>
                        <span className="pipe-pct" style={{ width: 96 }}>{mt(r.sourced)} / {r.qty_mt}</span>
                      </div>
                      <div className="cell-sub">{r.remaining > 0.01 ? <><b>{mt(r.remaining)}</b> still to source</> : 'fully sourced'}</div>
                    </td>
                    <td>{dateShort(r.need_by_date)}</td>
                    <td><StatusPill status={r.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="help">
        <b>The problem this solves:</b> a 25 MT need rarely comes from one supplier. Split it across L1/L2/L3 here and the
        month-end truth — from whom, how much, at what blended cost — is always one click away.
      </div>
    </>
  );
}

export default withTenantPage(RequirementsPage);
