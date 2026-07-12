import Link from 'next/link';
import { PageHead, Badge } from '@/components/ui';
import { trucks } from '@/lib/queries';
import { TRUCK_LABEL, dateShort, mt } from '@/lib/format';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: '', label: 'All trips' },
  { key: 'IN_TRANSIT', label: 'On the road' },
  { key: 'ARRIVED', label: 'Waiting to unload' },
  { key: 'UNLOADED', label: 'Unloaded' },
];

export default async function TrucksPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = '' } = await searchParams;
  const rows = trucks(status);

  return (
    <>
      <PageHead
        title="Trucks"
        sub="Every load of copper — which truck, which e-way bill, when it arrived, and whether the weight matched."
      />

      <div className="pills">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key ? `/trucks?status=${t.key}` : '/trucks'} className={`pill${status === t.key ? ' on' : ''}`}>
            {t.label}
          </Link>
        ))}
      </div>

      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Truck</th>
              <th>Booking / party</th>
              <th className="num">Load</th>
              <th>Papers</th>
              <th>Journey</th>
              <th>Unloading</th>
              <th className="num">Weight check</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const shortKg = t.received_weight_kg != null ? +(t.dispatch_weight_kg - t.received_weight_kg).toFixed(1) : null;
              const dirIn = t.kind === 'PURCHASE';
              return (
                <tr key={t.id}>
                  <td>
                    <div className="cell-main mono">{t.truck_no}</div>
                    <div className="cell-sub">{t.transporter}</div>
                  </td>
                  <td>
                    <div className="cell-main">{t.party_name}</div>
                    <div className="cell-sub">
                      <span className="mono-sm">{t.booking_no}</span> · {dirIn ? 'coming to us' : 'going to customer'}
                    </div>
                  </td>
                  <td className="num"><b>{mt(t.qty_mt)}</b></td>
                  <td>
                    <div className="mono-sm">{t.eway_bill_no}</div>
                    <div className="cell-sub mono-sm">{t.challan_no}</div>
                  </td>
                  <td>
                    <div>{dateShort(t.dispatch_date)} → {t.arrived_date ? dateShort(t.arrived_date) : <span className="muted">on the way</span>}</div>
                    <Badge tone={t.status === 'UNLOADED' ? 'good' : t.status === 'ARRIVED' ? 'warn' : 'copper'}>
                      {TRUCK_LABEL[t.status]}
                    </Badge>
                  </td>
                  <td>
                    {t.unloaded_date
                      ? <><div>{dateShort(t.unloaded_date)}</div><div className="cell-sub">{t.unloaded_by}</div></>
                      : <span className="muted">pending</span>}
                  </td>
                  <td className="num">
                    {shortKg == null
                      ? <span className="muted">—</span>
                      : shortKg > 10
                        ? <span className="neg" title={`Sent ${t.dispatch_weight_kg} kg, received ${t.received_weight_kg} kg`}>−{shortKg} kg</span>
                        : <span className="pos">OK</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="help">
        <b>Weight check</b> compares the weighbridge slip at dispatch with the weight received at unloading.
        Anything more than 10 kg short is flagged red — chase these with the transporter or supplier before paying the bill.
      </div>
    </>
  );
}
