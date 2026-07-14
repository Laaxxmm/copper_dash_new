import { withTenantPage } from '@/lib/tenant-resolve';
import Link from 'next/link';
import { PageHead, Badge } from '@/components/ui';
import { pendingCustomerCaptures, type ParsedDoc } from '@/lib/capture';
import { captureCustomerEmail, confirmCustomerCapture, rejectCapture } from '@/lib/capture-actions';
import { mt } from '@/lib/format';

export const dynamic = 'force-dynamic';

async function SalesInboxPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const rows = pendingCustomerCaptures();

  return (
    <>
      <PageHead title="Customer inbox" sub="Paste a customer's PO. It's matched to the customer and recorded against their open PI when you confirm — nothing posts on its own." />
      {err ? <div className="form-error">⚠ {err}</div> : null}

      <form action={captureCustomerEmail} className="card card-pad">
        <div className="card-title">Capture a customer PO</div>
        <textarea name="text" rows={5} required placeholder="Paste the customer's PO email (and PDF text) here…"
          style={{ width: '100%', fontFamily: 'var(--font-mono), monospace', fontSize: 13, padding: 12, borderRadius: 12, border: '1px solid #e2d9ca', background: 'var(--input)', color: 'var(--ink)' }} />
        <button className="btn btn-sm" type="submit" style={{ marginTop: 12 }}>Read &amp; match</button>
      </form>

      <div className="card table-wrap section-gap">
        <div className="card-pad" style={{ paddingBottom: 0 }}><div className="card-title">Review queue</div></div>
        {rows.length === 0 ? (
          <p className="muted" style={{ padding: '4px 20px 20px' }}>Nothing waiting. Paste a customer PO above, or set the mail map in <Link href="/settings" style={{ fontWeight: 700 }}>Settings</Link>.</p>
        ) : (
          <table className="data">
            <thead><tr><th>Document</th><th>Customer</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const p = JSON.parse(c.extracted_json) as ParsedDoc;
                const isCancel = c.doc_type === 'CANCEL';
                return (
                  <tr key={c.id}>
                    <td>
                      <Badge tone={isCancel ? 'bad' : c.doc_type === 'UNKNOWN' ? 'neutral' : 'copper'}>{c.doc_type}</Badge>
                      <div className="cell-sub mono-sm">{c.reference_no ?? 'no ref'}</div>
                      <div className="cell-sub">{p.qty_mt != null ? mt(p.qty_mt) : ''}</div>
                    </td>
                    <td>{c.customer ? <Link href={`/sales/customers/${c.matched_customer_id}`} className="cell-main" style={{ color: 'var(--copper-text)' }}>{c.customer}</Link> : <span className="neg">no match</span>}</td>
                    <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <form action={confirmCustomerCapture}><input type="hidden" name="capture_id" value={c.id} /><button type="submit" className="btn-order" style={{ cursor: 'pointer' }}>{isCancel ? 'Confirm cancel' : 'Confirm — record PO'}</button></form>
                      <form action={rejectCapture}><input type="hidden" name="capture_id" value={c.id} /><button type="submit" className="btn-order skip" style={{ cursor: 'pointer' }}>Reject</button></form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="help">A confirmed PO is recorded against the customer&apos;s latest open PI. A cancellation email voids their most recent sell order. Set each customer&apos;s email domain/keywords in <Link href="/settings" style={{ fontWeight: 700 }}>Settings</Link>.</div>
    </>
  );
}

export default withTenantPage(SalesInboxPage);
