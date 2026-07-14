import { withTenantPage } from '@/lib/tenant-resolve';
import Link from 'next/link';
import { PageHead } from '@/components/ui';
import SupplierCompare from '@/components/SupplierCompare';
import { productTargets, supplierScorecard } from '@/lib/queries';
import { products, supplierBoard } from '@/lib/pricing';
import { saveSupplierPlan } from '@/lib/actions';
import { mt, today } from '@/lib/format';

export const dynamic = 'force-dynamic';

function pct(n: number, d: number) {
  return d > 0 ? Math.min(100, Math.round((n / d) * 100)) : 0;
}

async function SuppliersPage({ searchParams }: { searchParams: Promise<{ month?: string; product?: string }> }) {
  const sp = await searchParams;
  const prods = products();
  const month = sp.month || today().slice(0, 7);
  const productId = Number(sp.product) || prods[0]?.id;
  const product = prods.find((p) => p.id === productId);

  const rows = productTargets(month, productId);
  // Computed cheapest-first ranking for this product — shown as a hint beside the manual rank.
  const board = supplierBoard(productId);
  const hint = new Map(board.rows.map((r) => [r.supplier_id, { tier: r.tier, rate: r.rate_inr_kg }]));

  return (
    <>
      <PageHead title="Suppliers" sub="Rank your supply base and set this month's tonnage target for each — then track what's actually lifted." />

      <form className="month-pick" method="get">
        <label>Product
          <select name="product" defaultValue={String(productId)}>
            {prods.map((p) => <option key={p.id} value={p.id}>{p.description}</option>)}
          </select>
        </label>
        <label>Month <input type="month" name="month" defaultValue={month} /></label>
        <button className="btn-sm" type="submit">View</button>
      </form>

      <div className="grid kpi-grid">
        {rows.map((r) => {
          const h = hint.get(r.supplier_id);
          const p = pct(r.lifted_mt, r.target_mt || r.agreed_mt);
          return (
            <form key={r.supplier_id} action={saveSupplierPlan} className="card card-pad supplier-card">
              <input type="hidden" name="supplier_id" value={r.supplier_id} />
              <input type="hidden" name="product_id" value={productId} />
              <input type="hidden" name="month" value={month} />

              <div className="kpi-head">
                <Link href={`/suppliers/${r.supplier_id}`} className="kpi-name" style={{ color: 'var(--copper-text)' }}>{r.supplier}</Link>
                <span className="rank-pill">{r.manual_rank ? `L${r.manual_rank}` : 'unranked'}</span>
              </div>
              <div className="sc-meta">
                {r.city ?? '—'}{r.phone ? ` · ${r.phone}` : ''}
                {h ? <span className="sc-hint"> · market {h.tier} @ ₹{h.rate.toFixed(1)}/kg</span> : null}
              </div>

              <div className="kpi-nums">
                <span><b>{mt(r.target_mt)}</b><i>target</i></span>
                <span><b>{mt(r.agreed_mt)}</b><i>agreed</i></span>
                <span><b>{mt(Math.round(r.lifted_mt * 10) / 10)}</b><i>lifted</i></span>
              </div>
              <span className="pipe-bar" style={{ height: 8 }}>
                <span className="pipe-fill" style={{ width: `${p}%`, background: p >= 100 ? 'var(--good)' : 'var(--copper)' }} />
              </span>
              <div className="kpi-foot"><span>{p}% of {r.target_mt > 0 ? 'target' : 'agreed'}</span></div>

              <div className="sc-edit">
                <label>L-rank<input name="rank" type="number" min="0" step="1" defaultValue={r.manual_rank ?? ''} placeholder="—" /></label>
                <label>Target<input name="target_mt" type="number" min="0" step="0.5" defaultValue={r.target_mt || ''} placeholder="MT" /></label>
                <label>Agreed<input name="agreed_mt" type="number" min="0" step="0.5" defaultValue={r.agreed_mt || ''} placeholder="MT" /></label>
                <button className="btn-sm" type="submit">Save</button>
              </div>
            </form>
          );
        })}
      </div>

      <div className="section-gap">
        <div className="section-title">Which supplier is better</div>
        <div className="card">
          <SupplierCompare scores={supplierScorecard()} />
        </div>
      </div>

      <div className="help">
        <b>How this works:</b> set the <b>L-rank</b> you prefer to buy from (L1 first), then this month&apos;s <b>target</b> for {product?.description ?? 'the product'}. Phone the supplier, and when he commits a quantity put it in <b>agreed</b>. <b>Lifted</b> fills in automatically as material moves. The comparison ranks by realised margin, on-time delivery, transit and weight cut.
      </div>
    </>
  );
}

export default withTenantPage(SuppliersPage);
