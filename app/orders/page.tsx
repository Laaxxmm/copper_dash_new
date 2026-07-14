import Link from 'next/link';
import { PageHead, StatusBadge } from '@/components/ui';
import { orderList } from '@/lib/queries';
import { products } from '@/lib/pricing';
import { all } from '@/lib/db';
import { mt, inr, perKg, dateShort, BASIS_LABEL, today } from '@/lib/format';

export const dynamic = 'force-dynamic';

function weekStart(t: string): string {
  const x = new Date(t + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); // back to Monday
  return x.toISOString().slice(0, 10);
}

export default async function OrdersPage({ searchParams }: {
  searchParams: Promise<{ from?: string; to?: string; product?: string; supplier?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const from = sp.from ?? '';
  const to = sp.to ?? '';
  const product = sp.product ?? '';
  const supplier = sp.supplier ?? '';
  const status = sp.status ?? '';

  const rows = orderList({ from, to, product, supplier: Number(supplier) || undefined, status });
  const prods = products();
  const suppliers = all<{ id: number; name: string }>(`SELECT id, name FROM parties WHERE type='SUPPLIER' ORDER BY name`);

  const t = today();
  const presets: [string, string, string][] = [
    ['All', '', ''],
    ['Today', t, t],
    ['This week', weekStart(t), t],
    ['This month', t.slice(0, 7) + '-01', t],
  ];
  const activePreset = (pf: string, pt: string) => from === pf && to === pt;

  const qs = new URLSearchParams({ from, to, product, supplier, status, type: 'orders' });
  const totalQty = rows.reduce((s, r) => s + r.qty_mt, 0);
  const totalBilled = rows.reduce((s, r) => s + r.billed, 0);

  return (
    <>
      <PageHead title="Orders" sub="Every purchase order in sequence — filter by date, product, supplier or status, then download." />

      <div className="orders-layout">
        <aside className="filter-rail">
          <div className="fr-block">
            <div className="fr-label">Date range</div>
            <div className="fr-presets">
              {presets.map(([label, pf, pt]) => (
                <Link key={label} href={`/orders?${new URLSearchParams({ from: pf, to: pt, product, supplier, status })}`}
                  className={`fr-chip${activePreset(pf, pt) ? ' on' : ''}`}>{label}</Link>
              ))}
            </div>
          </div>

          <form method="get" className="fr-form">
            <label className="fr-field">Custom from
              <input type="date" name="from" defaultValue={from} />
            </label>
            <label className="fr-field">to
              <input type="date" name="to" defaultValue={to} />
            </label>
            <label className="fr-field">Product
              <select name="product" defaultValue={product}>
                <option value="">All products</option>
                <option value="WIRE">— All wire —</option>
                <option value="ROD">— All rod —</option>
                {prods.map((p) => <option key={p.id} value={p.id}>{p.description}</option>)}
              </select>
            </label>
            <label className="fr-field">Supplier
              <select name="supplier" defaultValue={supplier}>
                <option value="">All suppliers</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="fr-field">Status
              <select name="status" defaultValue={status}>
                <option value="">Any status</option>
                <option value="OPEN">Running</option>
                <option value="COMPLETED">Finished</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
            <div className="fr-actions">
              <button className="btn-sm" type="submit">Apply</button>
              <Link href="/orders" className="btn-order outline">Clear</Link>
            </div>
          </form>
        </aside>

        <div className="orders-main">
          <div className="orders-bar">
            <span><b>{rows.length}</b> orders · <b>{mt(Math.round(totalQty * 10) / 10)}</b> · billed <b>{inr(totalBilled)}</b></span>
            <a className="btn-sm" href={`/api/report?${qs}`}>Download Excel</a>
          </div>
          <div className="card">
            {rows.length === 0 ? (
              <p className="card-pad muted">No orders match these filters. <Link href="/orders" style={{ fontWeight: 700 }}>Clear →</Link></p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr><th>Order</th><th>Date</th><th>Supplier</th><th>Product</th><th>Qty</th><th>Basis</th><th>Priced</th><th>Lifted</th><th>Value</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="mono"><Link href={`/orders/${encodeURIComponent(r.booking_no)}`} style={{ color: 'var(--accent)', fontWeight: 700 }}>{r.booking_no}</Link></td>
                        <td>{dateShort(r.booking_date)}</td>
                        <td><Link href={`/suppliers/${r.supplier_id}`} className="cell-main" style={{ color: 'var(--ink)' }}>{r.supplier}</Link></td>
                        <td>{r.product_desc ?? '—'}</td>
                        <td>{mt(r.qty_mt)}</td>
                        <td>{BASIS_LABEL[r.pricing_basis] ?? r.pricing_basis}</td>
                        <td>{r.avg_rate != null ? perKg(r.avg_rate) : '—'}</td>
                        <td>{mt(Math.round(r.lifted_qty * 10) / 10)}</td>
                        <td>{r.billed > 0 ? inr(r.billed) : '—'}</td>
                        <td><StatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
