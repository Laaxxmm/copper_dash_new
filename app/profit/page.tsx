import { PageHead, Tile } from '@/components/ui';
import TradeChart from '@/components/charts/TradeChart';
import { customerProfit, dealMargins, monthlyTrade } from '@/lib/queries';
import { dateShort, inr, mt, perKg } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default function ProfitPage() {
  const monthly = monthlyTrade();
  const deals = dealMargins();
  const byCustomer = customerProfit();

  const totalMargin = deals.reduce((s, d) => s + d.margin_total, 0);
  const totalQty = deals.reduce((s, d) => s + d.qty, 0);
  const avgMarginMt = totalQty ? totalMargin / totalQty : 0;
  const losing = deals.filter((d) => d.margin_mt < 0);

  return (
    <>
      <PageHead
        title="Profit"
        sub="What the business actually earns: the gap between the buying rate and the selling rate on matched deals."
      />

      <div className="grid tiles">
        <Tile label="Earned on matched deals" value={inr(totalMargin)} tone={totalMargin >= 0 ? 'good' : 'bad'} note={<>{deals.length} deals · {mt(totalQty)} priced both sides</>} accent />
        <Tile label="Average earning per MT" value={inr(avgMarginMt)} note={`That is about ₹${(avgMarginMt / 1000).toFixed(1)} per kg`} />
        <Tile
          label="Deals losing money" value={String(losing.length)}
          tone={losing.length > 0 ? 'warn' : 'good'}
          note={losing.length ? <>worst: <b>{inr(Math.min(...losing.map((d) => d.margin_total)))}</b></> : 'Every matched deal is in profit'}
        />
      </div>

      <div className="card card-pad section-gap">
        <div className="card-title">Bought vs sold, month by month (value before GST)</div>
        <div className="legend">
          <span className="key"><span className="swatch" style={{ background: 'var(--cat-1)' }} />Sold</span>
          <span className="key"><span className="swatch" style={{ background: 'var(--cat-2)' }} />Bought</span>
        </div>
        <TradeChart data={monthly} />
        <p className="chart-note">
          Sold higher than bought is healthy. The gap is gross margin plus timing — see the deal table for the exact earning on each matched pair.
        </p>
      </div>

      <div className="grid two-col section-gap">
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Deal (sale ↔ purchase)</th>
                <th>Customer / supplier</th>
                <th className="num">Qty</th>
                <th className="num">Sold at</th>
                <th className="num">Bought at</th>
                <th className="num">Earned</th>
              </tr>
            </thead>
            <tbody>
              {deals.slice(0, 25).map((d) => (
                <tr key={d.sale_no}>
                  <td>
                    <div className="cell-main mono">{d.sale_no} ↔ {d.purchase_no}</div>
                    <div className="cell-sub">{dateShort(d.sale_date)}</div>
                  </td>
                  <td>
                    <div className="cell-main">{d.customer}</div>
                    <div className="cell-sub">from {d.supplier}</div>
                  </td>
                  <td className="num">{mt(d.qty)}</td>
                  <td className="num">{perKg(d.sale_rate)}</td>
                  <td className="num">{perKg(d.buy_rate)}</td>
                  <td className="num">
                    <b className={d.margin_total >= 0 ? 'pos' : 'neg'}>{inr(d.margin_total)}</b>
                    <div className="cell-sub">₹{(d.margin_mt / 1000).toFixed(1)}/kg</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card card-pad">
          <div className="card-title">Which customers earn the most</div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Customer</th><th className="num">Deals</th><th className="num">Qty</th><th className="num">Earned</th></tr>
              </thead>
              <tbody>
                {byCustomer.map((c) => (
                  <tr key={c.customer}>
                    <td className="cell-main">{c.customer}</td>
                    <td className="num">{c.deals}</td>
                    <td className="num">{mt(c.qty)}</td>
                    <td className="num"><b className={c.margin >= 0 ? 'pos' : 'neg'}>{inr(c.margin)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="chart-note">
            Earning = (selling rate − buying rate) × quantity, on deals where a sale booking is tied to a purchase booking and both sides are priced.
          </p>
        </div>
      </div>

      <div className="help">
        <b>Why some deals show a loss:</b> when material is lifted at “price later” and the market moves before the
        rate is fixed, the buying rate can end up above the selling rate. That is exactly the risk the
        “Quantity without a price” number on the Today page is warning about.
      </div>
    </>
  );
}
