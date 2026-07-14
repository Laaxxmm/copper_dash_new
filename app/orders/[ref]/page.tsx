import { withTenantPage } from '@/lib/tenant-resolve';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead, StatusBadge, Pipeline } from '@/components/ui';
import { orderDetail } from '@/lib/queries';
import { mt, inr, perKg, dateShort, dateLong, BASIS_LABEL } from '@/lib/format';

export const dynamic = 'force-dynamic';

const LIFT_STATUS: Record<string, string> = { IN_TRANSIT: 'In transit', ARRIVED: 'Arrived', UNLOADED: 'Unloaded' };

async function OrderPage({ params }: { params: Promise<{ ref: string }> }) {
  const ref = decodeURIComponent((await params).ref);
  const data = orderDetail(ref);
  if (!data) notFound();
  const { order, fixations, liftings } = data;

  const avgWindow = order.avg_start && order.avg_end ? `${dateShort(order.avg_start)} – ${dateShort(order.avg_end)}` : null;
  const terms: [string, React.ReactNode][] = [
    ['Booked on', dateLong(order.booking_date)],
    ['Product', order.product_desc ?? '—'],
    ['Quantity', mt(order.qty_mt)],
    ['Pricing basis', BASIS_LABEL[order.pricing_basis] ?? order.pricing_basis],
    ['Premium', order.premium_inr_mt > 0 ? `₹${Math.round(order.premium_inr_mt).toLocaleString('en-IN')}/MT` : '—'],
    ['Averaging window', avgWindow ?? '—'],
    ['Lift by', order.lift_by_date ? dateLong(order.lift_by_date) : '—'],
    ['Back-to-back sale', order.linked_booking_no ?? '—'],
  ];

  return (
    <>
      <PageHead title={order.booking_no} sub={`Purchase order · ${order.supplier}`} />

      <div className="sup-head card card-pad">
        <div className="sup-id">
          <StatusBadge status={order.status} />
          <span className="sup-contact">
            {mt(order.qty_mt)} · {order.product_desc ?? 'copper'} · {BASIS_LABEL[order.pricing_basis] ?? order.pricing_basis}
          </span>
        </div>
        <div className="sup-actions">
          <Link href={`/suppliers/${order.supplier_id}`} className="btn-order outline">View supplier</Link>
          <Link href="/orders" className="btn-order outline">All orders</Link>
        </div>
      </div>

      <div className="grid tiles section-gap">
        <div className="card tile"><div className="t-label">Quantity booked</div><div className="t-value">{mt(order.qty_mt)}</div><div className="t-note">{dateShort(order.booking_date)}</div></div>
        <div className="card tile accent"><div className="t-label">Priced rate</div><div className="t-value">{order.avg_rate != null ? perKg(order.avg_rate) : 'Not fixed'}</div><div className="t-note">{mt(order.fixed_qty)} priced</div></div>
        <div className="card tile"><div className="t-label">Lifted</div><div className="t-value">{mt(Math.round(order.lifted_qty * 10) / 10)}</div><div className="t-note">of {mt(order.qty_mt)}</div></div>
        <div className="card tile"><div className="t-label">Order value</div><div className="t-value">{order.billed > 0 ? inr(order.billed) : '—'}</div><div className="t-note">invoiced so far</div></div>
      </div>

      <div className="grid two-col section-gap">
        <div>
          <div className="section-title">Order terms</div>
          <div className="card card-pad">
            <table className="data compact kv">
              <tbody>
                {terms.map(([k, v]) => (<tr key={k}><td className="muted">{k}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{v}</td></tr>))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="section-title">Progress</div>
          <div className="card card-pad">
            <Pipeline qty={order.qty_mt} fixed={order.fixed_qty} lifted={order.lifted_qty} />
            {order.notes ? <p className="muted" style={{ marginTop: 12 }}>{order.notes}</p> : null}
          </div>
        </div>
      </div>

      <div className="section-gap">
        <div className="section-title">Price fixations</div>
        <div className="card">
          {fixations.length === 0 ? (
            <p className="card-pad muted">No price fixed yet — this quantity is still exposed to the live market.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Date</th><th>Qty</th><th>Rate</th><th>Reference</th><th>Note</th></tr></thead>
                <tbody>
                  {fixations.map((f, i) => (
                    <tr key={i}>
                      <td>{dateShort(f.fixation_date)}</td>
                      <td>{mt(f.qty_mt)}</td>
                      <td>{perKg(f.price_inr_mt)}</td>
                      <td>{f.reference === 'CSP' ? 'CSP' : 'Negotiated'}</td>
                      <td className="muted">{f.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="section-gap">
        <div className="section-title">Liftings</div>
        <div className="card">
          {liftings.length === 0 ? (
            <p className="card-pad muted">Nothing lifted against this order yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Dispatch</th><th>Qty</th><th>Truck</th><th>Transporter</th><th>E-way bill</th><th>Weight</th><th>Status</th></tr></thead>
                <tbody>
                  {liftings.map((l) => (
                    <tr key={l.id}>
                      <td>{dateShort(l.dispatch_date)}</td>
                      <td>{mt(l.qty_mt)}</td>
                      <td className="mono">{l.truck_no ?? '—'}</td>
                      <td>{l.transporter ?? '—'}</td>
                      <td className="mono">{l.eway_bill_no ?? '—'}</td>
                      <td>{(l.received_weight_kg ?? l.dispatch_weight_kg) != null ? `${Math.round(l.received_weight_kg ?? l.dispatch_weight_kg!).toLocaleString('en-IN')} kg` : '—'}</td>
                      <td>{LIFT_STATUS[l.status] ?? l.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default withTenantPage(OrderPage);
