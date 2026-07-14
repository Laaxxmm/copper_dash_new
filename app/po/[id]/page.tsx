import Link from 'next/link';
import { notFound } from 'next/navigation';
import PrintButton from '@/components/PrintButton';
import { purchaseOrder } from '@/lib/queries';
import { cancelPO } from '@/lib/po-actions';
import { companyProfile } from '@/lib/company';
import { amountInWords, isInterState } from '@/lib/po';
import { dateLong, BASIS_LABEL } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Full Indian-grouped rupees with paise (a PO is a legal document — show the paise).
const rs = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function POPage({ params }: { params: Promise<{ id: string }> }) {
  const po = purchaseOrder(Number((await params).id));
  if (!po) notFound();
  const co = companyProfile();
  const inter = isInterState(co.gstin, po.supplier_gstin);
  const cancelled = po.status === 'CANCELLED';

  return (
    <>
      <div className="po-toolbar">
        <div>
          <Link href="/orders" className="btn-order outline">← Orders</Link>
          <Link href={`/suppliers/${po.supplier_id}`} className="btn-order outline">Supplier</Link>
        </div>
        <div>
          {po.supplier_email
            ? <a className="btn-order" href={`mailto:${po.supplier_email}?subject=${encodeURIComponent(`Purchase Order ${po.po_no} — ${co.name}`)}&body=${encodeURIComponent(`Dear ${po.supplier_name},\n\nPlease find our Purchase Order ${po.po_no} for ${po.qty_mt} MT ${po.product_desc ?? ''} at provisional ₹${po.rate_inr_kg.toFixed(2)}/kg, total ${rs(po.gross_amount)} (incl. GST).\n\nRegards,\n${co.name}`)}`}>Email to supplier</a>
            : null}
          <PrintButton />
          {!cancelled
            ? <form action={cancelPO} style={{ display: 'inline' }}><input type="hidden" name="po_id" value={po.id} /><button className="btn-order skip" type="submit" style={{ cursor: 'pointer' }}>Cancel PO</button></form>
            : null}
        </div>
      </div>

      {cancelled ? <div className="po-cancelled">This PO was cancelled on {dateLong(po.cancelled_date)} — it no longer counts towards cost of purchase.</div> : null}

      <div className="po-doc card">
        <div className="po-title">
          <div>
            <div className="po-h1">Purchase Order</div>
            <div className="po-no">{po.po_no} · {dateLong(po.created_date)}</div>
          </div>
          <div className={`po-stamp ${cancelled ? 'x' : 'ok'}`}>{cancelled ? 'CANCELLED' : 'ISSUED'}</div>
        </div>

        <div className="po-parties">
          <div>
            <div className="po-lbl">Buyer (Bill to)</div>
            <div className="po-name">{co.name}</div>
            <div className="po-addr">{co.address}<br />{co.city}, {co.state}<br />GSTIN {co.gstin} · State code {co.state_code}<br />PAN {co.pan}</div>
          </div>
          <div>
            <div className="po-lbl">Supplier (Bill from)</div>
            <div className="po-name">{po.supplier_name}</div>
            <div className="po-addr">{po.supplier_city ?? ''}<br />{po.supplier_gstin ? `GSTIN ${po.supplier_gstin} · State code ${po.supplier_gstin.slice(0, 2)}` : 'GSTIN —'}</div>
          </div>
        </div>

        <table className="po-line">
          <thead><tr><th>#</th><th>Description</th><th>Qty (kg)</th><th>Rate ₹/kg</th><th>Amount ₹</th></tr></thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>{po.product_desc ?? 'Copper'} @ Provisional Price {dateLong(po.created_date)}{po.basis ? ` · ${BASIS_LABEL[po.basis] ?? po.basis}` : ''}</td>
              <td>{Math.round(po.qty_mt * 1000).toLocaleString('en-IN')}</td>
              <td>{po.rate_inr_kg.toFixed(2)}</td>
              <td>{rs(po.base_amount)}</td>
            </tr>
          </tbody>
        </table>

        <div className="po-totals">
          <div><span>Taxable value</span><b>{rs(po.base_amount)}</b></div>
          {inter
            ? <div><span>IGST 18%</span><b>{rs(po.tax_amount)}</b></div>
            : <>
                <div><span>CGST 9%</span><b>{rs(po.tax_amount / 2)}</b></div>
                <div><span>SGST 9%</span><b>{rs(po.tax_amount / 2)}</b></div>
              </>}
          <div className="po-gross"><span>Total</span><b>{rs(po.gross_amount)}</b></div>
        </div>

        <div className="po-words"><b>Amount in words:</b> INR {amountInWords(po.gross_amount)}</div>

        <div className="po-terms">
          <div className="po-lbl">Terms</div>
          <p>Pricing formula: (LME + Premium + Transaction) × (1 + Factor/100) × (Exchange Rate / 1000) + (Handling / 1000). LME ${po.lme_usd?.toLocaleString('en-US')}/MT, {po.fx_rate?.toFixed(2)}/USD.</p>
          <p>Provisional price (DNPL): bought 1st–15th priced before month-end; 16th–end before the 15th of next month. Margin call every US$200/MT move vs the provisional price. USD converted at the agreed TT rate. IGST extra as applicable. E.&O.E.</p>
        </div>
      </div>
    </>
  );
}
