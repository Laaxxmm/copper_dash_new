import { withTenantPage } from '@/lib/tenant-resolve';
import Link from 'next/link';
import { PageHead } from '@/components/ui';
import { priceTemplates, saleProducts, templateWithLines, evalFormula } from '@/lib/sale-pricing';
import { products, supplierBoard } from '@/lib/pricing';
import { all } from '@/lib/db';
import { saveSaleProduct, deleteTemplate, deleteSaleProduct } from '@/lib/sale-actions';

export const dynamic = 'force-dynamic';

/** Illustrative buy cost for a raw material = the current cheapest supplier rate. */
function cheapestBuy(rawId: number | null): number {
  if (!rawId) return 0;
  const rows = supplierBoard(rawId).rows;
  return rows.length ? rows[0].rate_inr_kg : 0;
}

async function PricingPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const templates = priceTemplates();
  const prods = saleProducts();
  const rawProducts = products();
  const customers = all<{ id: number; name: string }>(`SELECT id, name FROM parties WHERE type='CUSTOMER' ORDER BY name`);

  const priceOf = (p: (typeof prods)[number]) => {
    if (!p.template_id) return null;
    const t = templateWithLines(p.template_id);
    if (!t) return null;
    return evalFormula(t.lines, { buy_cost: cheapestBuy(p.raw_product_id), fabrication: p.fabrication_cost }).price;
  };

  return (
    <>
      <PageHead title="Products & pricing" sub="Build reusable price formulas, then attach them to the products each customer buys." />
      {err ? <div className="form-error">⚠ {err}</div> : null}

      <div className="section-title">Pricing templates</div>
      <div className="card section-gap-sm">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Template</th><th>Lines</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {templates.length === 0 ? (
                <tr><td colSpan={4} className="muted" style={{ padding: 16 }}>No templates yet. Build one — it&apos;s reusable across products and customers.</td></tr>
              ) : templates.map((t) => (
                <tr key={t.id}>
                  <td><Link href={`/sales/pricing/${t.id}`} className="cell-main" style={{ color: 'var(--copper-text)' }}>{t.name}</Link></td>
                  <td>{t.line_count}</td>
                  <td className="muted">{t.notes ?? '—'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <Link href={`/sales/pricing/${t.id}`} className="btn-order outline">Edit</Link>
                    <form action={deleteTemplate}><input type="hidden" name="template_id" value={t.id} /><button className="btn-order skip" type="submit">Delete</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Link href="/sales/pricing/new" className="btn btn-sm">+ New template</Link>

      <div className="section-title section-gap">Products by customer</div>
      <div className="card section-gap-sm">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Product</th><th>Customer</th><th>Raw material</th><th>Template</th><th>Fab ₹/kg</th><th>Sell ₹/kg*</th><th></th></tr></thead>
            <tbody>
              {prods.length === 0 ? (
                <tr><td colSpan={7} className="muted" style={{ padding: 16 }}>No products yet. Add one below.</td></tr>
              ) : prods.map((p) => {
                const price = priceOf(p);
                return (
                  <tr key={p.id}>
                    <td className="cell-main">{p.name}</td>
                    <td>{p.customer}</td>
                    <td>{p.raw_desc ?? '—'}</td>
                    <td>{p.template_name ?? <span className="muted">none</span>}</td>
                    <td>{p.fabrication_cost.toFixed(1)}</td>
                    <td>{price != null ? <b>₹{price.toFixed(2)}</b> : '—'}</td>
                    <td><form action={deleteSaleProduct}><input type="hidden" name="product_id" value={p.id} /><button className="btn-order skip" type="submit">Remove</button></form></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="chart-note" style={{ padding: '0 16px 14px' }}>*Illustrative, at today&apos;s cheapest supplier rate for the raw material. The real buy cost comes from the linked purchase when you raise the order.</p>
      </div>

      <form action={saveSaleProduct} className="card card-pad form">
        <div className="card-title">Add a product for a customer</div>
        <div className="form-grid">
          <label>Customer
            <select name="customer_id" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Product name<input name="name" type="text" required placeholder="e.g. 2.5mm drawn wire" /></label>
          <label>Raw material
            <select name="raw_product_id" defaultValue="">
              <option value="">— none —</option>
              <optgroup label="Wire">{rawProducts.filter((p) => p.type === 'WIRE').map((p) => <option key={p.id} value={p.id}>{p.description}</option>)}</optgroup>
              <optgroup label="Rod">{rawProducts.filter((p) => p.type === 'ROD').map((p) => <option key={p.id} value={p.id}>{p.description}</option>)}</optgroup>
            </select>
          </label>
          <label>Pricing template
            <select name="template_id" defaultValue="">
              <option value="">— none —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label>Fabrication cost (₹/kg)<input name="fabrication_cost" type="number" step="0.5" min="0" defaultValue={0} /></label>
        </div>
        <button type="submit" className="btn">Add product</button>
      </form>
    </>
  );
}

export default withTenantPage(PricingPage);
