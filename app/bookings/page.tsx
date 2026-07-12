import Link from 'next/link';
import { PageHead, Badge, Pipeline, StatusBadge } from '@/components/ui';
import { bookings } from '@/lib/queries';
import { BASIS_LABEL, dateShort, mt, perKg, inr } from '@/lib/format';

export const dynamic = 'force-dynamic';

const KIND_TABS = [
  { key: '', label: 'All' },
  { key: 'PURCHASE', label: 'We bought' },
  { key: 'SALE', label: 'We sold' },
];
const STATUS_TABS = [
  { key: '', label: 'Any status' },
  { key: 'OPEN', label: 'Running' },
  { key: 'COMPLETED', label: 'Finished' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string }> }) {
  const { kind = '', status = '' } = await searchParams;
  const rows = bookings(kind, status);

  const href = (k: string, s: string) => {
    const q = new URLSearchParams();
    if (k) q.set('kind', k);
    if (s) q.set('status', s);
    const qs = q.toString();
    return `/bookings${qs ? `?${qs}` : ''}`;
  };

  return (
    <>
      <PageHead
        title="Bookings"
        sub="Every deal made — with suppliers and with customers. Each one shows how much is priced and how much has moved."
      />

      <div className="pills">
        {KIND_TABS.map((t) => (
          <Link key={t.key} href={href(t.key, status)} className={`pill${kind === t.key ? ' on' : ''}`}>{t.label}</Link>
        ))}
        <span style={{ width: 10 }} />
        {STATUS_TABS.map((t) => (
          <Link key={t.key} href={href(kind, t.key)} className={`pill${status === t.key ? ' on' : ''}`}>{t.label}</Link>
        ))}
      </div>

      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Booking</th>
              <th>Party</th>
              <th className="num">Quantity</th>
              <th>Price basis</th>
              <th className="num">Rate so far</th>
              <th>Progress</th>
              <th className="num">Billed</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const unpriced = b.qty_mt - b.fixed_qty > 0.05 && b.status === 'OPEN';
              return (
                <tr key={b.id}>
                  <td>
                    <div className="cell-main mono">{b.booking_no}</div>
                    <div className="cell-sub">
                      {dateShort(b.booking_date)}
                      {b.linked_booking_no ? <> · back-to-back with <span className="mono-sm">{b.linked_booking_no}</span></> : null}
                    </div>
                  </td>
                  <td>
                    <div className="cell-main">{b.party_name}</div>
                    <div className="cell-sub">{b.kind === 'PURCHASE' ? 'Supplier' : 'Customer'}</div>
                  </td>
                  <td className="num"><b>{mt(b.qty_mt)}</b></td>
                  <td>
                    <Badge tone={b.pricing_basis === 'PRICE_LATER' ? (unpriced ? 'warn' : 'neutral') : 'neutral'}>
                      {BASIS_LABEL[b.pricing_basis]}
                    </Badge>
                    {b.avg_start ? <div className="cell-sub">{dateShort(b.avg_start)} – {dateShort(b.avg_end)}</div> : null}
                  </td>
                  <td className="num">
                    {b.avg_fixed_price
                      ? <span title="Weighted average of fixed prices">{perKg(b.avg_fixed_price)}</span>
                      : <span className="muted">not fixed</span>}
                  </td>
                  <td><Pipeline qty={b.qty_mt} fixed={b.fixed_qty} lifted={b.lifted_qty} /></td>
                  <td className="num">{b.billed_amount ? inr(b.billed_amount) : <span className="muted">—</span>}</td>
                  <td><StatusBadge status={b.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="help">
        <b>Price basis</b> is how the rate gets decided: the day&apos;s price, an average over a week / 15 days / month,
        a fixed negotiated rate, or <b>price later</b> — material moves first and the rate is fixed afterwards.
        The <b>Priced</b> bar fills as rates get fixed; the <b>Moved</b> bar fills as trucks lift the material.
        A running booking with material moved but a short Priced bar is open market risk.
      </div>
    </>
  );
}
