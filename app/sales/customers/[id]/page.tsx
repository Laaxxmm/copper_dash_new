import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead } from '@/components/ui';
import { party, partyLedger } from '@/lib/queries';
import { customerSalePIs } from '@/lib/sale-pricing';
import { companyProfile } from '@/lib/company';
import { get } from '@/lib/db';
import { inr, inrFull, dateShort } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const c = party(id);
  if (!c || c.type !== 'CUSTOMER') notFound();
  const co = companyProfile();
  const email = get<{ email: string | null }>(`SELECT email FROM parties WHERE id = ?`, id)?.email ?? null;
  const pis = customerSalePIs(id);
  const ledger = partyLedger(id);
  let bal = 0;

  const reminder = c.outstanding > 1 && email
    ? `mailto:${email}?subject=${encodeURIComponent(`Payment reminder — ${co.name}`)}&body=${encodeURIComponent(`Dear ${c.name},\n\nThis is a gentle reminder that ${inr(c.outstanding)} is outstanding on your account${c.overdue > 1 ? ` (${inr(c.overdue)} of it now overdue)` : ''}. Kindly arrange payment as per the agreed ${c.credit_days}-day terms.\n\nRegards,\n${co.name}`)}`
    : null;

  return (
    <>
      <PageHead title={c.name} sub={`${c.city ?? ''}${c.gstin ? ` · GSTIN ${c.gstin}` : ''}`} />

      <div className="sup-head card card-pad">
        <div className="sup-id">
          <span className="sup-contact">{c.contact_person ?? ''}{c.phone ? ` · ${c.phone}` : ''} · {c.credit_days === 0 ? 'advance payment' : `${c.credit_days} days credit`}</span>
        </div>
        <div className="sup-actions">
          {c.phone ? <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="btn-order outline">Call</a> : null}
          {reminder ? <a href={reminder} className="btn-order">Send reminder</a> : null}
          <Link href={`/sales/pi/new?customer=${id}`} className="btn-order outline">Issue PI</Link>
        </div>
      </div>

      <div className="grid tiles section-gap">
        <div className="card tile accent"><div className="t-label">Bought (lifetime)</div><div className="t-value">{c.volume_mt} MT</div><div className="t-note">{inr(c.billed_total)} billed</div></div>
        <div className="card tile"><div className="t-label">To collect</div><div className="t-value">{inr(c.outstanding)}</div></div>
        <div className={`card tile${c.overdue > 1 ? ' t-bad' : ''}`}><div className="t-label">Overdue</div><div className="t-value">{inr(c.overdue)}</div><div className="t-note">past {c.credit_days} days</div></div>
      </div>

      <div className="section-title section-gap">Proforma invoices</div>
      <div className="card">
        {pis.length === 0 ? (
          <p className="card-pad muted">No PIs yet. <Link href={`/sales/pi/new?customer=${id}`} style={{ fontWeight: 700 }}>Issue one →</Link></p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>PI</th><th>Date</th><th>Product</th><th>Qty</th><th>Rate</th><th>Total</th><th>Their PO</th><th>Status</th></tr></thead>
              <tbody>
                {pis.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/sales/pi/${p.id}`} className="cell-main mono" style={{ color: 'var(--copper-text)' }}>{p.pi_no}</Link></td>
                    <td>{dateShort(p.created_date)}</td>
                    <td>{p.product_name ?? '—'}</td>
                    <td>{p.qty_mt} MT</td>
                    <td>₹{p.rate_inr_kg.toFixed(2)}</td>
                    <td>{inr(p.gross_amount)}</td>
                    <td className="mono">{p.customer_po ?? <span className="muted">awaited</span>}</td>
                    <td>{p.status === 'CANCELLED' ? <span className="badge bad"><span className="dot" />Cancelled</span> : <span className="badge good"><span className="dot" />Issued</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section-title section-gap">Account ledger</div>
      <div className="card">
        {ledger.length === 0 ? (
          <p className="card-pad muted">No bills or payments yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Date</th><th>Entry</th><th>Reference</th><th>Detail</th><th className="num">Bill</th><th className="num">Paid</th><th className="num">Balance</th></tr></thead>
              <tbody>
                {ledger.map((e, i) => {
                  bal += (e.debit ?? 0) - (e.credit ?? 0);
                  return (
                    <tr key={i}>
                      <td>{dateShort(e.entry_date)}</td>
                      <td>{e.type === 'INVOICE' ? 'Bill' : 'Payment'}</td>
                      <td className="mono-sm">{e.ref ?? '—'}</td>
                      <td className="muted">{e.detail}</td>
                      <td className="num">{e.debit ? inrFull(e.debit) : ''}</td>
                      <td className="num">{e.credit ? inrFull(e.credit) : ''}</td>
                      <td className="num"><b>{inrFull(bal)}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
