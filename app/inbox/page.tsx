import Link from 'next/link';
import { PageHead, Badge } from '@/components/ui';
import { pendingCaptures, type ParsedDoc } from '@/lib/capture';
import { captureEmail, confirmCapture, rejectCapture } from '@/lib/capture-actions';
import { inr, mt } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const rows = pendingCaptures();

  return (
    <>
      <PageHead
        title="Inbox"
        sub="Paste a supplier's PI or PO email. It's read, matched to your enquiry and staged here — nothing is booked until you confirm."
      />
      {err ? <div className="form-error">⚠ {err}</div> : null}

      <form action={captureEmail} className="card card-pad">
        <div className="card-title">Capture a PI / PO</div>
        <textarea
          name="text" rows={5} required placeholder="Paste the email body (and PDF text) here…"
          style={{ width: '100%', fontFamily: 'var(--font-mono), monospace', fontSize: 13, padding: 12, borderRadius: 12, border: '1px solid #e2d9ca', background: 'var(--input)', color: 'var(--ink)' }}
        />
        <button className="btn btn-sm" type="submit" style={{ marginTop: 12 }}>Read &amp; match</button>
      </form>

      <div className="card table-wrap section-gap">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="card-title">Review queue — confirm to book, or reject</div>
        </div>
        {rows.length === 0 ? (
          <p className="muted" style={{ padding: '4px 20px 20px' }}>Nothing waiting. Paste a PI above to test the capture.</p>
        ) : (
          <table className="data">
            <thead>
              <tr><th>Document</th><th>Matched enquiry</th><th className="num">Rate ₹/kg</th><th>Check</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const p = JSON.parse(c.extracted_json) as ParsedDoc;
                const isCancel = c.doc_type === 'CANCEL';
                return (
                  <tr key={c.id}>
                    <td>
                      <Badge tone={isCancel ? 'bad' : c.doc_type === 'UNKNOWN' ? 'neutral' : 'copper'}>{c.doc_type}</Badge>
                      <div className="cell-sub mono-sm">{c.reference_no ?? 'no ref'}</div>
                      <div className="cell-sub">{p.qty_mt != null ? mt(p.qty_mt) : '— MT'}{p.stated_total != null ? ` · ${inr(p.stated_total)}` : ''}</div>
                    </td>
                    <td>
                      {c.req_no
                        ? <><Link href={`/requirements/${c.matched_requirement_id}`} className="cell-main mono" style={{ color: 'var(--copper-text)' }}>{c.req_no}</Link><div className="cell-sub">{c.supplier}</div></>
                        : <span className="neg">no match</span>}
                    </td>
                    <td className="num">{p.computed_rate_inr_kg != null ? `₹${p.computed_rate_inr_kg.toFixed(2)}` : '—'}</td>
                    <td>
                      {c.status === 'MISMATCH'
                        ? <span className="neg" title={`computed ${p.computed_total} vs stated ${p.stated_total}`}>⚠ amount mismatch</span>
                        : isCancel ? <span className="muted">cancellation</span>
                          : p.computed_rate_inr_kg != null ? <span className="pos">rate recomputes ✓</span> : <span className="muted">rate not in text</span>}
                    </td>
                    <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {c.matched_allocation_id && (
                        <form action={confirmCapture} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input type="hidden" name="capture_id" value={c.id} />
                          {!isCancel && (
                            <input name="rate" type="number" step="0.01" defaultValue={p.computed_rate_inr_kg ?? undefined}
                              placeholder="₹/kg" style={{ width: 90, padding: '7px 8px', borderRadius: 8, border: '1px solid #e2d9ca', background: 'var(--input)' }} />
                          )}
                          <button type="submit" className="btn-order" style={{ cursor: 'pointer' }}>{isCancel ? 'Confirm cancel' : 'Confirm & book'}</button>
                        </form>
                      )}
                      <form action={rejectCapture}>
                        <input type="hidden" name="capture_id" value={c.id} />
                        <button type="submit" className="btn-order skip" style={{ cursor: 'pointer' }}>Reject</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="help">
        <b>Confirm-first, always.</b> The rate is recomputed from the PI&apos;s own LME, premium, factor and exchange and
        checked against its printed total — a gap flags <b>amount mismatch</b> and never posts on its own. A
        &quot;cancelled&quot; email cancels the matched leg. Live mailbox reading connects later; for now paste the text.
      </div>
    </>
  );
}
