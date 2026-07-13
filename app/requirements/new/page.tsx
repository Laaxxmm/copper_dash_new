import Link from 'next/link';
import { PageHead } from '@/components/ui';
import { products } from '@/lib/pricing';
import { all } from '@/lib/db';
import { addRequirement } from '@/lib/req-actions';
import { today } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function NewRequirementPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const prods = products();
  const customers = all<{ id: number; name: string }>(`SELECT id, name FROM parties WHERE type='CUSTOMER' ORDER BY name`);

  return (
    <>
      <PageHead title="New requirement" sub="What do you need this month, and for whom? You'll split it across suppliers on the next screen." />
      {err ? <div className="form-error">⚠ {err}</div> : null}
      <form action={addRequirement} className="card card-pad form">
        <div className="card-title">The month's need</div>
        <div className="form-grid">
          <label>Product
            <select name="product_id" required defaultValue="">
              <option value="" disabled>Choose…</option>
              <optgroup label="Wire (< 6 mm)">
                {prods.filter((p) => p.type === 'WIRE').map((p) => <option key={p.id} value={p.id}>{p.description}</option>)}
              </optgroup>
              <optgroup label="Rod">
                {prods.filter((p) => p.type === 'ROD').map((p) => <option key={p.id} value={p.id}>{p.description}</option>)}
              </optgroup>
            </select>
          </label>
          <label>Quantity needed (MT)
            <input name="qty" type="number" step="0.1" min="0.1" required placeholder="e.g. 25" />
          </label>
          <label>For customer (optional)
            <select name="customer_id" defaultValue="">
              <option value="">For stock / not tied to a customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Need by
            <input name="need_by" type="date" />
          </label>
          <label>Your intended sell rate (₹ / kg)
            <input name="target_sell" type="number" step="0.1" placeholder="for profitability" />
            <span className="field-hint">used to check the blended buy cost leaves a margin</span>
          </label>
          <label>Booking date
            <input name="date" type="date" defaultValue={today()} disabled />
          </label>
          <label className="wide">Notes
            <input name="notes" type="text" placeholder="anything to remember" />
          </label>
        </div>
        <button className="btn" type="submit">Create requirement</button>
      </form>
      <div className="help"><Link href="/requirements" style={{ fontWeight: 700 }}>← Back to requirements</Link></div>
    </>
  );
}
