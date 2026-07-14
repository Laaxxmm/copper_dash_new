import { withTenantPage } from '@/lib/tenant-resolve';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import PrintButton from '@/components/PrintButton';
import { salePIFull } from '@/lib/sale-pricing';
import { cancelSalePI } from '@/lib/sale-order-actions';
import { companyProfile } from '@/lib/company';
import { amountInWords, isInterState } from '@/lib/po';
import { dateLong, BASIS_LABEL } from '@/lib/format';

export const dynamic = 'force-dynamic';

const rs = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function SalePIPage({ params }: { params: Promise<{ id: string }> }) {
  const pi = salePIFull(Number((await params).id));
  if (!pi) notFound();
  const co = companyProfile();
  const inter = isInterState(co.gstin, pi.customer_gstin);
  const cancelled = pi.status === 'CANCELLED';

  return (
    <>
      <div className="po-toolbar">
        <div>
          <Link href="/sales/orders" className="btn-order outline">← Sell orders</Link>
          <Link href={`/sales/customers/${pi.customer_id}`} className="btn-order outline">Customer</Link>
        </div>
        <div>
          {pi.customer_email
            ? <a className="btn-order" href={`mailto:${pi.customer_email}?subject=${encodeURIComponent(`Proforma Invoice ${pi.pi_no} — ${co.name}`)}&body=${encodeURIComponent(`Dear ${pi.customer_name},\n\nPlease find our Proforma Invoice ${pi.pi_no} for ${pi.qty_mt} MT ${pi.product_name ?? ''} at ₹${pi.rate_inr_kg.toFixed(2)}/kg, total ${rs(pi.gross_amount)} (incl. GST). Kindly raise your PO to confirm.\n\nRegards,\n${co.name}`)}`}>Email to customer</a>
            : null}
          <PrintButton />
          {!cancelled ? <form action={cancelSalePI} style={{ display: 'inline' }}><input type="hidden" name="pi_id" value={pi.id} /><button className="btn-order skip" type="submit" style={{ cursor: 'pointer' }}>Cancel PI</button></form> : null}
        </div>
      </div>

      {cancelled ? <div className="po-cancelled">This PI was cancelled on {dateLong(pi.cancelled_date)} — the linked sell order is void.</div> : null}

      <div className="po-doc card">
        <div className="po-title">
          <div>
            <div className="po-h1">Proforma Invoice</div>
            <div className="po-no">{pi.pi_no} · {dateLong(pi.created_date)}{pi.booking_no ? ` · order ${pi.booking_no}` : ''}</div>
          </div>
          <div className={`po-stamp ${cancelled ? 'x' : 'ok'}`}>{cancelled ? 'CANCELLED' : 'ISSUED'}</div>
        </div>

        <div className="po-parties">
          <div>
            <div className="po-lbl">Seller</div>
            <div className="po-name">{co.name}</div>
            <div className="po-addr">{co.address}<br />{co.city}, {co.state}<br />GSTIN {co.gstin} · State code {co.state_code}</div>
          </div>
          <div>
            <div className="po-lbl">Buyer (customer)</div>
            <div className="po-name">{pi.customer_name}</div>
            <div className="po-addr">{pi.customer_city ?? ''}<br />{pi.customer_gstin ? `GSTIN ${pi.customer_gstin} · State code ${pi.customer_gstin.slice(0, 2)}` : 'GSTIN —'}</div>
          </div>
        </div>

        <table className="po-line">
          <thead><tr><th>#</th><th>Description</th><th>Qty (kg)</th><th>Rate ₹/kg</th><th>Amount ₹</th></tr></thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>{pi.product_name ?? 'Copper'}{pi.basis ? ` · ${BASIS_LABEL[pi.basis] ?? pi.basis}` : ''}</td>
              <td>{Math.round(pi.qty_mt * 1000).toLocaleString('en-IN')}</td>
              <td>{pi.rate_inr_kg.toFixed(2)}</td>
              <td>{rs(pi.base_amount)}</td>
            </tr>
          </tbody>
        </table>

        <div className="po-totals">
          <div><span>Taxable value</span><b>{rs(pi.base_amount)}</b></div>
          {inter
            ? <div><span>IGST 18%</span><b>{rs(pi.tax_amount)}</b></div>
            : <><div><span>CGST 9%</span><b>{rs(pi.tax_amount / 2)}</b></div><div><span>SGST 9%</span><b>{rs(pi.tax_amount / 2)}</b></div></>}
          <div className="po-gross"><span>Total</span><b>{rs(pi.gross_amount)}</b></div>
        </div>

        <div className="po-words"><b>Amount in words:</b> INR {amountInWords(pi.gross_amount)}</div>

        <div className="po-terms">
          <div className="po-lbl">Terms</div>
          <p>Provisional proforma. Kindly raise your Purchase Order to confirm; goods released against your PO. Payment as per agreed credit terms. GST extra as applicable. E.&O.E.</p>
          {pi.source_no ? <p>Sourced from {pi.source_supplier} ({pi.source_no}), bought on {BASIS_LABEL[pi.source_basis ?? ''] ?? pi.source_basis} basis; sold on {BASIS_LABEL[pi.basis ?? ''] ?? pi.basis} basis.</p> : null}
        </div>
      </div>
    </>
  );
}

export default withTenantPage(SalePIPage);
