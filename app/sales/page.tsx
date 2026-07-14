import Link from 'next/link';
import { PageHead } from '@/components/ui';
import { partySummaries } from '@/lib/queries';
import { inr } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default function SalesPage() {
  const customers = partySummaries('CUSTOMER');
  const totalOut = customers.reduce((s, c) => s + c.outstanding, 0);
  const totalOverdue = customers.reduce((s, c) => s + c.overdue, 0);

  return (
    <>
      <PageHead title="Customers" sub="Who you sell to — their credit terms, what they've bought, and what's still to collect." />

      <div className="grid tiles">
        <div className="card tile accent"><div className="t-label">Customers</div><div className="t-value">{customers.length}</div></div>
        <div className="card tile"><div className="t-label">To collect</div><div className="t-value">{inr(totalOut)}</div><div className="t-note">across all customers</div></div>
        <div className={`card tile${totalOverdue > 0 ? ' t-bad' : ''}`}><div className="t-label">Overdue</div><div className="t-value">{inr(totalOverdue)}</div><div className="t-note">past the credit period</div></div>
      </div>

      <div className="card section-gap">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Customer</th><th>City</th><th>Credit</th><th>Bought (MT)</th><th>To collect</th><th>Overdue</th><th></th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/sales/customers/${c.id}`} className="cell-main" style={{ color: 'var(--copper-text)' }}>{c.name}</Link>
                    <div className="cell-sub">{c.contact_person ?? ''}{c.phone ? ` · ${c.phone}` : ''}</div></td>
                  <td>{c.city ?? '—'}</td>
                  <td>{c.credit_days === 0 ? 'advance' : `${c.credit_days} days`}</td>
                  <td>{c.volume_mt}</td>
                  <td>{c.outstanding > 1 ? inr(c.outstanding) : '—'}</td>
                  <td>{c.overdue > 1 ? <span className="neg">{inr(c.overdue)}</span> : '—'}</td>
                  <td><Link href={`/sales/customers/${c.id}`} className="btn-order outline">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="help">Products &amp; pricing, sell orders, PIs and collection reminders arrive in the next Sales updates. Customer list, credit terms and outstanding are live now.</div>
    </>
  );
}
