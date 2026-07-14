import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead } from '@/components/ui';
import { StatusBadge } from '@/components/ui';
import SupplierCalc from '@/components/SupplierCalc';
import {
  supplierDetail, supplierTermsByProduct, supplierMonthByProduct, supplierCostByBasis,
  supplierPurchaseOrders, bookings,
} from '@/lib/queries';
import { resolveLme, latestLme, fxRate } from '@/lib/pricing';
import { westmetallLme } from '@/lib/market';
import { mt, inr, perKg, dateShort, BASIS_LABEL, monthLabel, today } from '@/lib/format';

export const dynamic = 'force-dynamic';

function pct(a: number, b: number) { return b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0; }

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const sup = supplierDetail(id);
  if (!sup) notFound();

  const month = today().slice(0, 7);
  const latest = latestLme()?.usd_mt ?? 0;
  const live = (await westmetallLme())?.usd_mt ?? latest;
  const basisLme: Record<string, number> = {
    DAY: live,
    WEEK_AVG: resolveLme('WEEK_AVG') ?? live,
    FORTNIGHT_AVG: resolveLme('FORTNIGHT_AVG') ?? live,
    MONTH_AVG: resolveLme('MONTH_AVG') ?? live,
  };
  const rbi = fxRate('RBI_TT');
  const sbi = fxRate('SBI_TT');

  const terms = supplierTermsByProduct(id);
  const monthRows = supplierMonthByProduct(id, month);
  const costByBasis = supplierCostByBasis(id);
  const pos = supplierPurchaseOrders(id);
  const orders = bookings('PURCHASE', undefined, id).slice(0, 12);

  return (
    <>
      <PageHead title={sup.name} sub={`${sup.city ?? ''}${sup.gstin ? ` · GSTIN ${sup.gstin}` : ''}`} />

      <div className="sup-head card card-pad">
        <div className="sup-id">
          <span className="rank-pill">{sup.manual_rank ? `L${sup.manual_rank}` : 'unranked'}</span>
          <span className="sup-contact">{sup.phone ?? 'no phone'}{sup.email ? ` · ${sup.email}` : ''} · {sup.credit_days === 0 ? 'advance payment' : `${sup.credit_days} days credit`}</span>
        </div>
        <div className="sup-actions">
          {sup.phone ? <a href={`tel:${sup.phone.replace(/\s/g, '')}`} className="btn-order outline">Call to confirm</a> : null}
          <Link href={`/po/new?supplier=${id}${terms[0] ? `&product=${terms[0].product_id}` : ''}`} className="btn-order">Send PO</Link>
          <Link href="/suppliers" className="btn-order outline">All suppliers</Link>
        </div>
      </div>

      <div className="grid two-col section-gap">
        <div>
          <div className="section-title">Payment calculator</div>
          <SupplierCalc supplierId={id} terms={terms} exchangeBasis={sup.exchange_basis} basisLme={basisLme} rbi={rbi} sbi={sbi} />
        </div>

        <div>
          <div className="section-title">{monthLabel(month)} — plan</div>
          <div className="card card-pad">
            {monthRows.length === 0 ? (
              <p className="muted">No target set for this month. <Link href={`/suppliers?product=${terms[0]?.product_id}`} style={{ fontWeight: 700 }}>Set one →</Link></p>
            ) : (
              <table className="data compact">
                <thead><tr><th>Product</th><th>Target</th><th>Agreed</th><th>Lifted</th><th></th></tr></thead>
                <tbody>
                  {monthRows.map((r) => (
                    <tr key={r.product_id}>
                      <td>{r.description}</td>
                      <td>{mt(r.target_mt)}</td>
                      <td>{mt(r.agreed_mt)}</td>
                      <td><b>{mt(Math.round(r.lifted_mt * 10) / 10)}</b></td>
                      <td>{pct(r.lifted_mt, r.target_mt || r.agreed_mt)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="section-title section-gap">Average cost by basis (all lifted)</div>
          <div className="card card-pad">
            {costByBasis.length === 0 ? (
              <p className="muted">Nothing lifted from this supplier yet.</p>
            ) : (
              <table className="data compact">
                <thead><tr><th>Priced on</th><th>Qty</th><th>Avg cost</th></tr></thead>
                <tbody>
                  {costByBasis.map((r) => (
                    <tr key={r.basis}>
                      <td>{BASIS_LABEL[r.basis] ?? r.basis}</td>
                      <td>{mt(r.qty)}</td>
                      <td>{r.avg_rate_mt != null ? perKg(r.avg_rate_mt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="section-gap">
        <div className="section-title">Orders from this supplier</div>
        <div className="card">
          {orders.length === 0 ? (
            <p className="card-pad muted">No purchase orders booked with this supplier yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Order</th><th>Date</th><th>Qty</th><th>Basis</th><th>Priced</th><th>Lifted</th><th>Status</th></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="mono">{o.booking_no}</td>
                      <td>{dateShort(o.booking_date)}</td>
                      <td>{mt(o.qty_mt)}</td>
                      <td>{BASIS_LABEL[o.pricing_basis] ?? o.pricing_basis}</td>
                      <td>{o.avg_fixed_price != null ? perKg(o.avg_fixed_price) : '—'}</td>
                      <td>{mt(Math.round(o.lifted_qty * 10) / 10)}</td>
                      <td><StatusBadge status={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="section-gap">
        <div className="section-title">Purchase orders & documents</div>
        <div className="card card-pad">
          {pos.length === 0 ? (
            <p className="muted">No POs issued yet. The PO composer and mailbox PI/PO tracking arrive in the next update.</p>
          ) : (
            <table className="data compact">
              <thead><tr><th>PO</th><th>Date</th><th>Qty</th><th>Rate</th><th>Gross</th><th>Status</th></tr></thead>
              <tbody>
                {pos.map((p) => (
                  <tr key={p.po_no}>
                    <td className="mono">{p.po_no}</td>
                    <td>{dateShort(p.created_date)}</td>
                    <td>{mt(p.qty_mt)}</td>
                    <td>₹{p.rate_inr_kg.toFixed(1)}/kg</td>
                    <td>{inr(p.gross_amount)}</td>
                    <td>{p.status === 'CANCELLED' ? <span className="badge bad"><span className="dot" />Cancelled</span> : <span className="badge good"><span className="dot" />Sent</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
