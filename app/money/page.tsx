import Link from 'next/link';
import { PageHead, Tile, Badge } from '@/components/ui';
import { invoices, moneySummary, payments, receivableAging } from '@/lib/queries';
import { MODE_LABEL, dateShort, inr, inrFull, mt } from '@/lib/format';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: '', label: 'All bills' },
  { key: 'SALE', label: 'Customer bills (money coming)' },
  { key: 'PURCHASE', label: 'Supplier bills (money going)' },
];

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ kind?: string; unpaid?: string }> }) {
  const { kind = '', unpaid = '' } = await searchParams;
  const onlyUnpaid = unpaid === '1';
  const rows = invoices(kind, onlyUnpaid);
  const money = moneySummary();
  const aging = receivableAging();
  const agingOrder = ['Not yet due', '1–15 days late', '16–30 days late', 'Over 30 days late'];
  const agingSorted = agingOrder.map((b) => ({ bucket: b, amount: aging.find((a) => a.bucket === b)?.amount ?? 0 }));
  const agingMax = Math.max(...agingSorted.map((a) => a.amount), 1);
  const recentPayments = payments().slice(0, 10);

  const href = (k: string, u: boolean) => {
    const q = new URLSearchParams();
    if (k) q.set('kind', k);
    if (u) q.set('unpaid', '1');
    const qs = q.toString();
    return `/money${qs ? `?${qs}` : ''}`;
  };

  return (
    <>
      <PageHead
        title="Money"
        sub="Every bill and every payment — what is settled, what is pending, and how it was paid."
      />

      <div className="grid tiles">
        <Tile label="To receive" value={inr(money.receivable.total)} tone="good" note="From customers, all pending bills" accent />
        <Tile
          label="Already late" value={inr(money.receivable.overdue)}
          tone={money.receivable.overdue > 0 ? 'bad' : undefined}
          note="Customer bills past their due date"
        />
        <Tile label="To pay" value={inr(money.payable.total)} note="To suppliers, all pending bills" />
        <Tile label="Due in next 7 days" value={inr(money.payable.due7 + money.receivable.due7)} note={<>{inr(money.receivable.due7)} coming in · {inr(money.payable.due7)} going out</>} />
      </div>

      <div className="grid two-col section-gap">
        <div>
          <div className="pills">
            {TABS.map((t) => (
              <Link key={t.key} href={href(t.key, onlyUnpaid)} className={`pill${kind === t.key ? ' on' : ''}`}>{t.label}</Link>
            ))}
            <Link href={href(kind, !onlyUnpaid)} className={`pill${onlyUnpaid ? ' on' : ''}`}>Only pending</Link>
          </div>

          <div className="card table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Party</th>
                  <th className="num">Amount</th>
                  <th className="num">Still pending</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 40).map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div className="cell-main mono">{i.invoice_no}</div>
                      <div className="cell-sub">{dateShort(i.invoice_date)} · {mt(i.qty_mt)} · {i.booking_no}</div>
                    </td>
                    <td>
                      <div className="cell-main">{i.party_name}</div>
                      <div className="cell-sub">{i.kind === 'SALE' ? 'owes us' : 'we owe'}</div>
                    </td>
                    <td className="num" title={`Base ${inrFull(i.base_amount)} + GST ${inrFull(i.gst_amount)}`}>{inr(i.total_amount)}</td>
                    <td className="num">
                      {i.outstanding > 1
                        ? <b className={i.kind === 'SALE' ? 'neg' : undefined}>{inr(i.outstanding)}</b>
                        : <Badge tone="good">Settled</Badge>}
                    </td>
                    <td>
                      {dateShort(i.due_date)}
                      {i.outstanding > 1 && i.overdue_days > 0 && (
                        <div className="cell-sub"><span className="neg">{i.overdue_days} days late</span></div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid" style={{ gap: 14 }}>
          <div className="card card-pad">
            <div className="card-title">Customer money — how old is it?</div>
            {agingSorted.map((a) => (
              <div className="pipe-row" style={{ margin: '9px 0' }} key={a.bucket}>
                <span style={{ width: 118, fontSize: 13, color: 'var(--ink-2)', flexShrink: 0 }}>{a.bucket}</span>
                <span className="pipe-bar" style={{ height: 12 }}>
                  <span
                    className="pipe-fill"
                    style={{
                      width: `${Math.round((a.amount / agingMax) * 100)}%`,
                      background: a.bucket === 'Not yet due' ? 'var(--good)' : a.bucket === '1–15 days late' ? 'var(--warn)' : 'var(--bad)',
                    }}
                  />
                </span>
                <span className="pipe-pct" style={{ width: 70, fontSize: 12 }}>{inr(a.amount)}</span>
              </div>
            ))}
            <p className="chart-note">The longer money sits, the harder it is to collect. Chase the red buckets first.</p>
          </div>

          <div className="card card-pad">
            <div className="card-title">Recent payments</div>
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  {recentPayments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="cell-main">{p.direction === 'IN' ? '↓ ' : '↑ '}{p.party_name}</div>
                        <div className="cell-sub">
                          {dateShort(p.payment_date)} · {MODE_LABEL[p.mode]}
                          {p.utr_no ? <> · <span className="mono-sm">{p.utr_no}</span></> : null}
                        </div>
                      </td>
                      <td className="num">
                        <b className={p.direction === 'IN' ? 'pos' : undefined}>{p.direction === 'IN' ? '+' : '−'}{inr(p.amount)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="help">
        <b>Every payment carries its bank reference (UTR)</b> — so any “we already paid” dispute is settled by
        matching the UTR against the bank statement. Hover any bill amount to see the GST break-up.
      </div>
    </>
  );
}
