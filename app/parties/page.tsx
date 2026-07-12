import Link from 'next/link';
import { PageHead, Badge } from '@/components/ui';
import { partySummaries } from '@/lib/queries';
import { inr, mt } from '@/lib/format';

export const dynamic = 'force-dynamic';

function PartyTable({ title, rows, isSupplier }: { title: string; rows: ReturnType<typeof partySummaries>; isSupplier: boolean }) {
  return (
    <div className="card">
      <div className="card-pad" style={{ paddingBottom: 0 }}>
        <div className="card-title">{title}</div>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th className="num">Running orders</th>
              <th className="num">Business done</th>
              <th className="num">Total billing</th>
              <th className="num">{isSupplier ? 'We owe' : 'They owe'}</th>
              <th>Payment terms</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/parties/${p.id}`}>
                    <div className="cell-main" style={{ color: 'var(--copper-text)' }}>{p.name} →</div>
                    <div className="cell-sub">{p.city}</div>
                  </Link>
                </td>
                <td>
                  <div>{p.contact_person}</div>
                  <div className="cell-sub mono-sm">{p.phone}</div>
                </td>
                <td className="num">
                  {p.open_orders > 0
                    ? <><b>{p.open_orders}</b><div className="cell-sub">{mt(p.open_qty)}</div></>
                    : <span className="muted">—</span>}
                </td>
                <td className="num">{mt(p.volume_mt)}</td>
                <td className="num">{p.billed_total ? inr(p.billed_total) : <span className="muted">—</span>}</td>
                <td className="num">
                  {p.outstanding > 1 ? <b className={!isSupplier && p.overdue > 0 ? 'neg' : undefined}>{inr(p.outstanding)}</b> : <Badge tone="good">Clear</Badge>}
                  {!isSupplier && p.overdue > 1 ? <div className="cell-sub"><span className="neg">{inr(p.overdue)} late</span></div> : null}
                </td>
                <td>{p.credit_days === 0 ? <Badge tone="copper">Advance</Badge> : <Badge tone="neutral">{p.credit_days} days credit</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PartiesPage() {
  const suppliers = partySummaries('SUPPLIER');
  const customers = partySummaries('CUSTOMER');
  return (
    <>
      <PageHead
        title="People"
        sub="Everyone you buy from and sell to. Click a name for their complete account."
      />
      <div className="pills">
        <Link href="/add?what=party" className="pill">+ Add a new customer or supplier</Link>
      </div>
      <div className="grid" style={{ gap: 20 }}>
        <PartyTable title="Suppliers — we buy copper from them" rows={suppliers} isSupplier />
        <PartyTable title="Customers — we sell copper to them" rows={customers} isSupplier={false} />
      </div>
    </>
  );
}
