import { withTenantPage } from '@/lib/tenant-resolve';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHead, Tile, Badge, Pipeline, StatusBadge } from '@/components/ui';
import { bookings, party, partyLedger } from '@/lib/queries';
import { BASIS_LABEL, dateShort, inr, inrFull, mt, perKg } from '@/lib/format';

export const dynamic = 'force-dynamic';

async function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = party(Number(id));
  if (!p) notFound();
  const orders = bookings(undefined, undefined, p.id);
  const ledger = partyLedger(p.id);

  let balance = 0;
  const rows = ledger.map((e) => {
    balance += (e.debit ?? 0) - (e.credit ?? 0);
    return { ...e, balance };
  });
  const isSupplier = p.type === 'SUPPLIER';

  return (
    <>
      <PageHead
        title={p.name}
        sub={`${isSupplier ? 'Supplier' : 'Customer'} · ${p.city} · ${p.contact_person} (${p.phone}) · GSTIN ${p.gstin ?? '—'}`}
      />

      <div className="grid tiles">
        <Tile
          label={isSupplier ? 'We owe them' : 'They owe us'}
          value={inr(p.outstanding)}
          tone={p.outstanding > 1 ? (isSupplier ? 'warn' : 'bad') : 'good'}
          note={p.outstanding > 1 ? 'From pending bills in the account below' : 'Account fully settled'}
          accent
        />
        <Tile
          label="Running orders"
          value={String(p.open_orders)}
          note={p.open_orders > 0 ? <><b>{mt(p.open_qty)}</b> booked and in progress</> : 'No open bookings right now'}
        />
        <Tile label="Business done" value={mt(p.volume_mt)} note={<>Total billing <b>{inr(p.billed_total)}</b> (with GST)</>} />
        <Tile label="Payment terms" value={p.credit_days === 0 ? 'Advance' : `${p.credit_days} days`} note={p.notes ?? ''} />
      </div>

      <div className="card table-wrap section-gap">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="card-title">All orders with {p.name}</div>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Order</th>
              <th className="num">Quantity</th>
              <th>Price basis</th>
              <th className="num">Rate</th>
              <th>Progress</th>
              <th className="num">Billed</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan={7} className="muted">No orders yet — add one from the Add entry page.</td></tr>
            )}
            {orders.map((b) => (
              <tr key={b.id}>
                <td>
                  <div className="cell-main mono">{b.booking_no}</div>
                  <div className="cell-sub">{dateShort(b.booking_date)}{b.linked_booking_no ? <> · with <span className="mono-sm">{b.linked_booking_no}</span></> : null}</div>
                </td>
                <td className="num"><b>{mt(b.qty_mt)}</b></td>
                <td><Badge tone="neutral">{BASIS_LABEL[b.pricing_basis]}</Badge></td>
                <td className="num">{b.avg_fixed_price ? perKg(b.avg_fixed_price) : <span className="muted">not fixed</span>}</td>
                <td><Pipeline qty={b.qty_mt} fixed={b.fixed_qty} lifted={b.lifted_qty} /></td>
                <td className="num">{b.billed_amount ? inr(b.billed_amount) : <span className="muted">—</span>}</td>
                <td><StatusBadge status={b.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card table-wrap section-gap">
        <div className="card-pad" style={{ paddingBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <div className="card-title">Account — every bill and payment, with running balance</div>
          <a className="btn btn-sm" href={`/api/report?type=ledger&party=${p.id}`} download>⬇ Download account (Excel)</a>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Entry</th>
              <th>Details</th>
              <th className="num">Bill amount</th>
              <th className="num">Paid</th>
              <th className="num">Running balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={i}>
                <td>{dateShort(e.entry_date)}</td>
                <td>
                  <span className={`badge ${e.type === 'INVOICE' ? 'neutral' : 'good'}`}>
                    {e.type === 'INVOICE' ? 'Bill' : 'Payment'}
                  </span>
                </td>
                <td>
                  <span className="mono-sm">{e.ref}</span>
                  <div className="cell-sub">{e.detail}</div>
                </td>
                <td className="num">{e.debit ? inr(e.debit) : ''}</td>
                <td className="num">{e.credit ? <span className="pos">{inr(e.credit)}</span> : ''}</td>
                <td className="num mono" title={inrFull(e.balance)}>{inr(e.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="help">
        Everything with {p.name} in one place — orders on top (with how much is priced and moved), then the money
        account with every bill, every payment (with bank reference) and the balance after each entry.{' '}
        <Link href="/parties" style={{ fontWeight: 700 }}>← Back to all people</Link>
      </div>
    </>
  );
}

export default withTenantPage(PartyPage);
