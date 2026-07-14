import { withTenantPage } from '@/lib/tenant-resolve';
import Link from 'next/link';
import { PageHead } from '@/components/ui';
import { all } from '@/lib/db';
import { products } from '@/lib/pricing';
import { createPO } from '@/lib/po-actions';

export const dynamic = 'force-dynamic';

async function NewPOPage({ searchParams }: { searchParams: Promise<{ supplier?: string; product?: string }> }) {
  const sp = await searchParams;
  const suppliers = all<{ id: number; name: string }>(`SELECT id, name FROM parties WHERE type='SUPPLIER' ORDER BY (manual_rank IS NULL), manual_rank, name`);
  const prods = products();

  return (
    <>
      <PageHead title="Send a purchase order" sub="Pick supplier, product and quantity — the provisional rate is computed live from today's LME and the supplier's terms." />

      <form action={createPO} className="card card-pad form" style={{ maxWidth: 560 }}>
        <div className="form-grid">
          <label className="wide">Supplier
            <select name="supplier_id" required defaultValue={sp.supplier ?? ''}>
              <option value="" disabled>Choose…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="wide">Product
            <select name="product_id" required defaultValue={sp.product ?? ''}>
              <option value="" disabled>Choose…</option>
              <optgroup label="Wire">{prods.filter((p) => p.type === 'WIRE').map((p) => <option key={p.id} value={p.id}>{p.description}</option>)}</optgroup>
              <optgroup label="Rod">{prods.filter((p) => p.type === 'ROD').map((p) => <option key={p.id} value={p.id}>{p.description}</option>)}</optgroup>
            </select>
          </label>
          <label>Quantity (MT)
            <input name="qty_mt" type="number" step="0.001" min="0.001" required placeholder="e.g. 4.178" />
          </label>
        </div>
        <button className="btn" type="submit">Compose PO →</button>
        <p className="chart-note">The PO opens on the next screen with the full calculation (IGST 18% inter-state), ready to email or print. Provisional price — bind it later under DNPL terms.</p>
      </form>

      <div className="help"><b>Tip:</b> you can also start a PO straight from a supplier&apos;s page or the dashboard. <Link href="/suppliers" style={{ fontWeight: 700 }}>Suppliers →</Link></div>
    </>
  );
}

export default withTenantPage(NewPOPage);
