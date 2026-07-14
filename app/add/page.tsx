import Link from 'next/link';
import { PageHead } from '@/components/ui';
import { all, get } from '@/lib/db';
import { addBooking, addFixation, addParty, addPayment, saveCsp, saveLme } from '@/lib/actions';
import { westmetallLme } from '@/lib/market';
import { BASIS_LABEL, inr, today } from '@/lib/format';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'booking', label: 'New booking' },
  { key: 'price-fix', label: 'Fix a price' },
  { key: 'payment', label: 'Payment' },
  { key: 'party', label: 'New customer / supplier' },
  { key: 'price', label: "Today's copper price" },
  { key: 'lme', label: "Today's LME" },
];

export default async function AddPage({ searchParams }: { searchParams: Promise<{ what?: string; err?: string }> }) {
  const { what = 'booking', err } = await searchParams;

  const suppliers = all<{ id: number; name: string }>(`SELECT id, name FROM parties WHERE type='SUPPLIER' ORDER BY name`);
  const customers = all<{ id: number; name: string }>(`SELECT id, name FROM parties WHERE type='CUSTOMER' ORDER BY name`);
  const openBookings = all<{ id: number; label: string; unfixed: number; unlifted: number }>(
    `SELECT b.id,
            b.booking_no || ' · ' || p.name || ' · ' || b.qty_mt || ' MT' label,
            ROUND(b.qty_mt - IFNULL((SELECT SUM(qty_mt) FROM price_fixations WHERE booking_id=b.id),0), 2) unfixed,
            ROUND(b.qty_mt - IFNULL((SELECT SUM(qty_mt) FROM liftings WHERE booking_id=b.id),0), 2) unlifted
     FROM bookings b JOIN parties p ON p.id=b.party_id
     WHERE b.status='OPEN' ORDER BY b.booking_date DESC`);
  const openPurchases = all<{ id: number; label: string }>(
    `SELECT b.id, b.booking_no || ' · ' || p.name label
     FROM bookings b JOIN parties p ON p.id=b.party_id
     WHERE b.status='OPEN' AND b.kind='PURCHASE' ORDER BY b.booking_date DESC`);
  const pendingBills = all<{ id: number; label: string }>(
    `SELECT i.id, i.invoice_no || ' · ' || p.name || ' · ' ||
            CASE i.kind WHEN 'SALE' THEN 'they owe ' ELSE 'we owe ' END ||
            '₹' || CAST(ROUND(i.total_amount - IFNULL(pay.paid,0)) AS INTEGER) label
     FROM invoices i JOIN parties p ON p.id = i.party_id
     LEFT JOIN (SELECT invoice_id, SUM(amount) paid FROM payments GROUP BY invoice_id) pay ON pay.invoice_id=i.id
     WHERE i.total_amount - IFNULL(pay.paid,0) > 1
     ORDER BY i.due_date`);
  const lastCsp = get<{ p: number }>(`SELECT price_inr_mt p FROM csp_prices ORDER BY price_date DESC LIMIT 1`)!.p;
  const lastLme = get<{ u: number; d: string; s: string }>(`SELECT usd_mt u, price_date d, source s FROM lme_prices ORDER BY price_date DESC LIMIT 1`);
  const liveLme = what === 'lme' ? await westmetallLme() : null;

  return (
    <>
      <PageHead
        title="Add entry"
        sub="Record things the moment they happen — a booking, a truck leaving, money arriving. It updates everywhere at once."
      />

      <div className="pills">
        {TABS.map((t) => (
          <Link key={t.key} href={`/add?what=${t.key}`} className={`pill${what === t.key ? ' on' : ''}`}>{t.label}</Link>
        ))}
      </div>

      {err ? <div className="form-error">⚠ {err}</div> : null}

      {what === 'booking' && (
        <form action={addBooking} className="card card-pad form">
          <div className="card-title">New booking — a deal agreed with a supplier or customer</div>
          <div className="form-grid">
            <label>Deal type
              <select name="kind" required defaultValue="">
                <option value="" disabled>Choose…</option>
                <option value="PURCHASE">We are buying (from a supplier)</option>
                <option value="SALE">We are selling (to a customer)</option>
              </select>
            </label>
            <label>Party
              <select name="party_id" required defaultValue="">
                <option value="" disabled>Choose…</option>
                <optgroup label="Suppliers (for buying)">
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </optgroup>
                <optgroup label="Customers (for selling)">
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              </select>
            </label>
            <label>Quantity (MT)
              <input name="qty" type="number" step="0.1" min="0.1" required placeholder="e.g. 4" />
            </label>
            <label>How is the price decided?
              <select name="basis" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {Object.entries(BASIS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Premium over market price (₹ per MT)
              <input name="premium" type="number" step="100" defaultValue={0} />
            </label>
            <label>Booking date
              <input name="date" type="date" defaultValue={today()} required />
            </label>
            <label>Material to be lifted by
              <input name="lift_by" type="date" />
            </label>
            <label>Back-to-back with purchase (for sales)
              <select name="linked_booking_id" defaultValue="">
                <option value="">Not linked</option>
                {openPurchases.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </label>
            <label className="wide">Notes
              <input name="notes" type="text" placeholder="anything to remember about this deal" />
            </label>
          </div>
          <button className="btn" type="submit">Save booking</button>
        </form>
      )}

      {what === 'price-fix' && (
        <form action={addFixation} className="card card-pad form">
          <div className="card-title">Fix a price — rate agreed for part or all of a booking</div>
          <div className="form-grid">
            <label className="wide">Booking
              <select name="booking_id" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {openBookings.filter((b) => b.unfixed > 0.05).map((b) => (
                  <option key={b.id} value={b.id}>{b.label} — {b.unfixed} MT unpriced</option>
                ))}
              </select>
            </label>
            <label>Quantity being priced (MT)
              <input name="qty" type="number" step="0.1" min="0.1" required />
            </label>
            <label>Rate (₹ per MT)
              <input name="rate" type="number" step="100" required placeholder={`market is ~${lastCsp.toLocaleString('en-IN')}`} />
            </label>
            <label>Date
              <input name="date" type="date" defaultValue={today()} required />
            </label>
          </div>
          <button className="btn" type="submit">Save price</button>
        </form>
      )}

      {what === 'payment' && (
        <form action={addPayment} className="card card-pad form">
          <div className="card-title">Payment — money received from a customer or paid to a supplier</div>
          <div className="form-grid">
            <label className="wide">Against which bill?
              <select name="invoice_id" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {pendingBills.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </label>
            <label>Amount (₹)
              <input name="amount" type="number" step="1" min="1" required />
            </label>
            <label>Date
              <input name="date" type="date" defaultValue={today()} required />
            </label>
            <label>How was it paid?
              <select name="mode" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {['RTGS', 'NEFT', 'IMPS', 'UPI', 'CHEQUE', 'CASH'].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label>Bank reference (UTR)
              <input name="utr" type="text" placeholder="from the bank SMS / statement" />
            </label>
            <label>Bank
              <input name="bank" type="text" placeholder="e.g. HDFC Bank" />
            </label>
          </div>
          <button className="btn" type="submit">Save payment</button>
        </form>
      )}

      {what === 'party' && (
        <form action={addParty} className="card card-pad form">
          <div className="card-title">New customer / supplier — add a firm you deal with</div>
          <div className="form-grid">
            <label>Who are they?
              <select name="type" required defaultValue="">
                <option value="" disabled>Choose…</option>
                <option value="SUPPLIER">Supplier — we buy copper from them</option>
                <option value="CUSTOMER">Customer — we sell copper to them</option>
              </select>
            </label>
            <label>Firm name
              <input name="name" type="text" required placeholder="e.g. Shree Ganesh Wires" />
            </label>
            <label>City
              <input name="city" type="text" placeholder="e.g. Coimbatore" />
            </label>
            <label>Contact person
              <input name="contact" type="text" placeholder="who you talk to" />
            </label>
            <label>Phone
              <input name="phone" type="text" placeholder="98xxx xxxxx" />
            </label>
            <label>GSTIN
              <input name="gstin" type="text" placeholder="15 characters, from their bill" />
            </label>
            <label>Email (for ordering slips)
              <input name="email" type="email" placeholder="sales@firm.com" />
            </label>
            <label>Payment terms (credit days)
              <input name="credit_days" type="number" min="0" max="365" defaultValue={0} />
              <span className="field-hint">0 = advance payment before material</span>
            </label>
            <label className="wide">Notes
              <input name="notes" type="text" placeholder="anything to remember about this firm" />
            </label>
          </div>
          <button className="btn" type="submit">Save {`firm`}</button>
        </form>
      )}

      {what === 'price' && (
        <form action={saveCsp} className="card card-pad form">
          <div className="card-title">Today&apos;s copper price — the producer rate everyone quotes against</div>
          <div className="form-grid">
            <label>Date
              <input name="date" type="date" defaultValue={today()} required />
            </label>
            <label>Price (₹ per MT)
              <input name="price" type="number" step="100" required defaultValue={lastCsp} />
            </label>
          </div>
          <button className="btn" type="submit">Save price</button>
          <p className="chart-note">Tip: enter this every morning from the producer&apos;s circular or your broker&apos;s message. {inr(lastCsp)} /MT was the last saved price.</p>
        </form>
      )}

      {what === 'lme' && (
        <form action={saveLme} className="card card-pad form">
          <div className="card-title">Today&apos;s LME — the US$ base every supplier quote is built on</div>
          <div className="form-grid">
            <label>Date
              <input name="date" type="date" defaultValue={today()} required />
            </label>
            <label>LME copper (US$ per MT)
              <input name="usd_mt" type="number" step="0.01" min="3000" max="40000" required
                     defaultValue={liveLme?.usd_mt ?? lastLme?.u} placeholder="e.g. 13250" />
            </label>
          </div>
          <button className="btn" type="submit">Save LME</button>
          <p className="chart-note">
            {liveLme
              ? `Live from westmetall.com right now: $${liveLme.usd_mt.toLocaleString('en-US')}/MT — confirm or edit before saving. `
              : `Feed unreachable — enter from your broker. `}
            {lastLme
              ? `Last saved: $${lastLme.u.toLocaleString('en-US')}/MT on ${lastLme.d} (${lastLme.s}).`
              : 'No LME saved yet.'}
          </p>
        </form>
      )}

      <div className="help">
        <b>Daily habit:</b> morning — save the copper price. During the day — every booking, truck and payment goes in
        the moment it happens (this page works fine from a phone). The Today page then always shows the true position;
        no evening register work.
      </div>
    </>
  );
}
