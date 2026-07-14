import Link from 'next/link';
import { PageHead } from '@/components/ui';
import { saleProducts, openPurchaseLots } from '@/lib/sale-pricing';
import { createSalePI } from '@/lib/sale-order-actions';
import { all } from '@/lib/db';
import { BASIS_LABEL } from '@/lib/format';

export const dynamic = 'force-dynamic';

const SELL_BASES = ['DAY_PRICE', 'WEEK_AVG', 'FORTNIGHT_AVG', 'MONTH_AVG'];

export default async function NewSalePIPage({ searchParams }: { searchParams: Promise<{ customer?: string; err?: string }> }) {
  const { err } = await searchParams;
  const customers = all<{ id: number; name: string }>(`SELECT id, name FROM parties WHERE type='CUSTOMER' ORDER BY name`);
  const prods = saleProducts();
  const lots = openPurchaseLots();

  return (
    <>
      <PageHead title="Issue a PI to a customer" sub="Pick the product and the purchase lot it's sold from — the price comes from the product's template, then we raise the proforma invoice." />
      {err ? <div className="form-error">⚠ {err}</div> : null}

      <form action={createSalePI} className="card card-pad form" style={{ maxWidth: 620 }}>
        <div className="form-grid">
          <label>Customer
            <select name="customer_id" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Product
            <select name="sale_product_id" defaultValue="">
              <option value="">— direct sale (enter rate) —</option>
              {prods.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.customer}{p.template_name ? ` · ${p.template_name}` : ''}</option>)}
            </select>
          </label>
          <label>Quantity (MT)
            <input name="qty_mt" type="number" step="0.001" min="0.001" required placeholder="e.g. 3" />
          </label>
          <label>Sold from (purchase lot)
            <select name="source_booking_id" defaultValue="">
              <option value="">— not linked —</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.booking_no} · {l.supplier}{l.product ? ` · ${l.product}` : ''} · {l.available} MT left{l.buy_rate_mt ? ` · ₹${(l.buy_rate_mt / 1000).toFixed(1)}/kg` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>We sell on basis
            <select name="sell_basis" defaultValue="DAY_PRICE">
              {SELL_BASES.map((b) => <option key={b} value={b}>{BASIS_LABEL[b] ?? b}</option>)}
            </select>
          </label>
          <label>Manual rate ₹/kg (only if no template)
            <input name="manual_rate" type="number" step="0.01" min="0" placeholder="optional" />
          </label>
        </div>
        <button type="submit" className="btn">Compose PI →</button>
        <p className="chart-note">The PI opens next with the full calculation (GST 18%), ready to email or print. Linking the purchase lot lets us track the buy-basis vs sell-basis profit later.</p>
      </form>

      <div className="help"><b>Tip:</b> set up products and their price templates first under <Link href="/sales/pricing" style={{ fontWeight: 700 }}>Products &amp; pricing</Link>.</div>
    </>
  );
}
