import { withTenantPage } from '@/lib/tenant-resolve';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead, Tile, Badge } from '@/components/ui';
import { allocations, blended, enquiryMailto, requirement } from '@/lib/requirements';
import { supplierBoard } from '@/lib/pricing';
import { cancelAllocation, cancelRequirement, confirmEnquiry, sendEnquiry } from '@/lib/req-actions';
import { dateShort, mt } from '@/lib/format';

export const dynamic = 'force-dynamic';

const ALLOC_STATUS: Record<string, { tone: 'good' | 'warn' | 'bad' | 'neutral' | 'copper'; label: string }> = {
  ENQUIRY: { tone: 'neutral', label: 'Enquiry' },
  PI_RECEIVED: { tone: 'copper', label: 'PI received' },
  PO_SENT: { tone: 'copper', label: 'PO sent' },
  PAID: { tone: 'copper', label: 'Paid' },
  DISPATCHED: { tone: 'warn', label: 'Dispatched' },
  RECEIVED: { tone: 'good', label: 'Received' },
  CANCELLED: { tone: 'bad', label: 'Cancelled' },
};

async function RequirementDetail({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }>;
}) {
  const { id } = await params;
  const { err } = await searchParams;
  const r = requirement(Number(id));
  if (!r) notFound();
  const legs = allocations(r.id);
  const b = blended(r.id);
  const board = supplierBoard(r.product_id);
  const live = legs.filter((l) => l.status !== 'CANCELLED');
  const cancelled = r.status === 'CANCELLED';

  // Margin is computed only on booked (price-fixed) lots; provisional legs are shown but not counted as profit.
  const finalCost = b.booked.rate;              // booked lots only — the defensible cost
  const headlineCost = finalCost ?? b.provisional.rate;
  const marginBase = finalCost ?? null;
  const margin = marginBase != null && r.target_sell_inr_kg != null ? Math.round((r.target_sell_inr_kg - marginBase) * 100) / 100 : null;

  return (
    <>
      <PageHead
        title={r.req_no}
        sub={`${r.product_desc} · ${r.customer ? `for ${r.customer}` : 'for stock'} · needed by ${dateShort(r.need_by_date)}`}
      />
      {err ? <div className="form-error">⚠ {err}</div> : null}

      <div className="grid tiles">
        <Tile label="Needed" value={mt(r.qty_mt)} note={r.customer ? `for ${r.customer}` : 'for stock'} accent />
        <Tile
          label="Sourced" value={mt(r.sourced)}
          tone={r.sourced >= r.qty_mt - 0.01 ? 'good' : undefined}
          note={<>from {live.length} supplier{live.length === 1 ? '' : 's'}</>}
        />
        <Tile
          label="Still to source" value={mt(r.remaining)}
          tone={r.remaining > 0.01 && !cancelled ? 'warn' : undefined}
          note={r.remaining > 0.01 ? 'add another supplier leg below' : 'fully sourced'}
        />
        <Tile
          label={finalCost != null ? 'Blended cost · booked' : 'Blended cost · provisional'}
          value={headlineCost != null ? `₹${headlineCost.toFixed(2)}/kg` : '—'}
          note={margin != null
            ? <>sell at ₹{r.target_sell_inr_kg!.toFixed(1)} → <b className={margin >= 0 ? 'pos' : 'neg'}>₹{margin.toFixed(2)}/kg {margin >= 0 ? 'margin' : 'loss'}</b> on booked lots</>
            : finalCost == null
              ? 'no lot booked yet — cost not final'
              : 'set a sell rate to see margin'}
        />
      </div>

      {b.unbookedQty > 0.01 && headlineCost != null && (
        <div className="notice bad" style={{ marginTop: 14 }}>
          Cost is <b>provisional</b>: {mt(b.unbookedQty)} is not price-fixed yet.
          {b.booked.rate != null && <> Booked lots so far: {mt(b.booked.qty)} at a final ₹{b.booked.rate.toFixed(2)}/kg.</>}
        </div>
      )}

      <div className="card table-wrap section-gap">
        <div className="card-pad" style={{ paddingBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div className="card-title">Supplier legs</div>
          <StatusBadge status={r.status} />
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Tier</th><th>Supplier</th><th className="num">Quantity</th>
              <th className="num">Rate ₹/kg</th><th>Cost</th><th>Booking</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {legs.length === 0 && <tr><td colSpan={8} className="muted">No supplier legs yet. Add the first one below.</td></tr>}
            {legs.map((l) => {
              const s = ALLOC_STATUS[l.status] ?? { tone: 'neutral' as const, label: l.status };
              return (
                <tr key={l.id}>
                  <td>{l.tier_label ? <span className={`rank-circle${l.tier_label === 'L1' ? ' best' : ''}`} style={{ width: 28, height: 28, fontSize: 12 }}>{l.tier_label}</span> : '—'}</td>
                  <td><Link href={`/parties/${l.supplier_id}`} className="cell-main" style={{ color: 'var(--copper-text)' }}>{l.supplier}</Link></td>
                  <td className="num"><b>{mt(l.qty_mt)}</b></td>
                  <td className="num">{l.rate_inr_kg != null ? `₹${l.rate_inr_kg.toFixed(2)}` : '—'}</td>
                  <td>{l.booked_rate_inr_kg != null ? <Badge tone="good">final ₹{l.booked_rate_inr_kg.toFixed(2)}</Badge> : <span className="muted">provisional</span>}</td>
                  <td>{l.booking_no ? <Link href="/bookings" className="mono-sm" style={{ color: 'var(--copper-text)' }}>{l.booking_no}</Link> : '—'}</td>
                  <td><Badge tone={s.tone}>{s.label}</Badge></td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {l.status === 'ENQUIRY' && (
                      <>
                        <a className="btn-order outline" href={enquiryMailto({ email: l.supplier_email, supplier: l.supplier, reqNo: r.req_no, product: r.product_desc, qty: l.qty_mt, needBy: r.need_by_date, rate: l.rate_inr_kg })}>Email</a>
                        <form action={confirmEnquiry}>
                          <input type="hidden" name="allocation_id" value={l.id} />
                          <input type="hidden" name="requirement_id" value={r.id} />
                          <button type="submit" className="btn-order" style={{ cursor: 'pointer' }}>Confirm PI</button>
                        </form>
                      </>
                    )}
                    {l.status !== 'CANCELLED' && !cancelled && (
                      <form action={cancelAllocation}>
                        <input type="hidden" name="allocation_id" value={l.id} />
                        <input type="hidden" name="requirement_id" value={r.id} />
                        <button type="submit" className="btn-order skip" style={{ cursor: 'pointer' }}>Cancel</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!cancelled && r.remaining > 0.01 && (
        <form action={sendEnquiry} className="card card-pad form section-gap">
          <div className="card-title">Request a quote — {mt(r.remaining)} still to source</div>
          <div className="form-grid">
            <label>Supplier (L1 is cheapest today)
              <select name="supplier_id" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {board.rows.map((row) => (
                  <option key={row.supplier_id} value={row.supplier_id}>{row.tier} · {row.supplier} — ₹{row.rate_inr_kg.toFixed(2)}/kg</option>
                ))}
              </select>
            </label>
            <label>Quantity from this supplier (MT)
              <input name="qty" type="number" step="0.1" min="0.1" max={r.remaining} required defaultValue={r.remaining} />
            </label>
            <label>Agreed rate (₹ / kg) — leave blank for today&apos;s rate
              <input name="rate" type="number" step="0.01" placeholder="auto from the board" />
            </label>
          </div>
          <input type="hidden" name="requirement_id" value={r.id} />
          <input type="hidden" name="req_no" value={r.req_no} />
          <button className="btn" type="submit">Send enquiry</button>
          <p className="chart-note">Records the leg as an enquiry. Then click <b>Email</b> to send it from your mail app, and <b>Confirm PI</b> when the supplier replies.</p>
        </form>
      )}

      <div className="help" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span>Each leg becomes a purchase booking, so it flows into trucks, bills and payments automatically. Blended cost updates as legs are added or cancelled.</span>
        {!cancelled && (
          <form action={cancelRequirement}>
            <input type="hidden" name="requirement_id" value={r.id} />
            <button type="submit" className="btn-order skip" style={{ cursor: 'pointer' }}>Cancel requirement</button>
          </form>
        )}
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'FILLED') return <Badge tone="good">Filled</Badge>;
  if (status === 'PARTIAL') return <Badge tone="warn">Partly sourced</Badge>;
  if (status === 'CANCELLED') return <Badge tone="bad">Cancelled</Badge>;
  return <Badge tone="copper">Open</Badge>;
}

export default withTenantPage(RequirementDetail);
