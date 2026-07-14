import { withTenantPage } from '@/lib/tenant-resolve';
import Link from 'next/link';
import { PageHead } from '@/components/ui';
import { salePIList } from '@/lib/sale-pricing';
import { inr, dateShort, BASIS_LABEL } from '@/lib/format';

export const dynamic = 'force-dynamic';

function SellOrdersPage() {
  const rows = salePIList();
  const live = rows.filter((r) => r.status === 'SENT');
  const totalGross = live.reduce((s, r) => s + r.gross_amount, 0);

  return (
    <>
      <PageHead title="Sell orders" sub="Proforma invoices raised to customers — the sell side of each deal." />

      <div className="orders-bar">
        <span><b>{live.length}</b> live PIs · <b>{inr(totalGross)}</b> billed value</span>
        <Link href="/sales/pi/new" className="btn-sm">+ New PI</Link>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <p className="card-pad muted">No PIs yet. <Link href="/sales/pi/new" style={{ fontWeight: 700 }}>Issue one →</Link></p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>PI</th><th>Date</th><th>Customer</th><th>Product</th><th>Qty</th><th>Basis</th><th>Rate ₹/kg</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/sales/pi/${r.id}`} className="cell-main mono" style={{ color: 'var(--copper-text)' }}>{r.pi_no}</Link></td>
                    <td>{dateShort(r.created_date)}</td>
                    <td>{r.customer}</td>
                    <td>{r.product_name ?? '—'}</td>
                    <td>{r.qty_mt} MT</td>
                    <td>{BASIS_LABEL[r.basis ?? ''] ?? r.basis}</td>
                    <td>₹{r.rate_inr_kg.toFixed(2)}</td>
                    <td>{inr(r.gross_amount)}</td>
                    <td>{r.status === 'CANCELLED' ? <span className="badge bad"><span className="dot" />Cancelled</span> : <span className="badge good"><span className="dot" />Issued</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default withTenantPage(SellOrdersPage);
