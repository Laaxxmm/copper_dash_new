import Link from 'next/link';
import { PageHead } from '@/components/ui';
import { today } from '@/lib/format';

export const dynamic = 'force-dynamic';

const REPORTS = [
  { type: 'all', title: 'Everything (one file, 5 sheets)', desc: 'Bookings, bills, payments, trucks and profit — the complete period in one Excel file.' },
  { type: 'bookings', title: 'Bookings', desc: 'Every deal: quantity, price basis, how much is priced and moved, billing and status.' },
  { type: 'bills', title: 'Bills (billing report)', desc: 'Every bill with GST break-up, what is paid and what is pending, due dates.' },
  { type: 'payments', title: 'Payments', desc: 'Every payment in and out with mode, UTR reference and bank.' },
  { type: 'trucks', title: 'Trucks & deliveries', desc: 'Every trip: e-way bill, weights, arrival, unloading, shortage.' },
  { type: 'profit', title: 'Profit (matched deals)', desc: 'Sale vs purchase rate on back-to-back deals, margin per MT and total.' },
];

function monthStart(offsetMonths = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths, 1);
  return d.toISOString().slice(0, 10);
}
function monthEnd(offsetMonths = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths + 1, 0);
  return d.toISOString().slice(0, 10);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const params = await searchParams;
  const from = params.from || monthStart();
  const to = params.to || today();

  const presets = [
    { label: 'This month', from: monthStart(), to: today() },
    { label: 'Last month', from: monthStart(-1), to: monthEnd(-1) },
    { label: 'Last 3 months', from: monthStart(-2), to: today() },
    { label: 'Last 6 months', from: monthStart(-5), to: today() },
  ];

  return (
    <>
      <PageHead
        title="Reports"
        sub="Pick a period, download any register as an Excel sheet — for the accountant, the bank, or your own checking."
      />

      <div className="card card-pad form" style={{ maxWidth: 'none' }}>
        <div className="card-title">Period</div>
        <div className="pills" style={{ marginBottom: 14 }}>
          {presets.map((p) => (
            <Link
              key={p.label}
              href={`/reports?from=${p.from}&to=${p.to}`}
              className={`pill${from === p.from && to === p.to ? ' on' : ''}`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form method="GET" action="/reports" className="period-row">
          <label>From <input name="from" type="date" defaultValue={from} required /></label>
          <label>To <input name="to" type="date" defaultValue={to} required /></label>
          <button className="btn btn-sm" type="submit">Apply</button>
        </form>
      </div>

      <div className="grid report-grid section-gap">
        {REPORTS.map((r) => (
          <div key={r.type} className="card card-pad report-card">
            <div>
              <div className="cell-main" style={{ fontSize: 16 }}>{r.title}</div>
              <p className="cell-sub" style={{ marginTop: 4, fontSize: 13 }}>{r.desc}</p>
            </div>
            <a className="btn btn-sm" href={`/api/report?type=${r.type}&from=${from}&to=${to}`} download>
              ⬇ Excel
            </a>
          </div>
        ))}
      </div>

      <div className="help">
        Files open directly in Excel / Google Sheets, one row per entry, amounts as numbers so you can total them.
        Party-wise account statements can be downloaded from each party&apos;s page under <b>People</b>.
        Reports cover <b>{from}</b> to <b>{to}</b> — change the period above and the download buttons follow.
      </div>
    </>
  );
}
