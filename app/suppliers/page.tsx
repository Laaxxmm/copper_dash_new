import Link from 'next/link';
import { PageHead } from '@/components/ui';
import { all } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Row = { id: number; name: string; city: string | null; phone: string | null; manual_rank: number | null };

export default function SuppliersPage() {
  const suppliers = all<Row>(
    `SELECT id, name, city, phone, manual_rank FROM parties WHERE type = 'SUPPLIER'
     ORDER BY (manual_rank IS NULL), manual_rank, name`);
  return (
    <>
      <PageHead title="Suppliers" sub="Your supply base, ranked. Set each month's target and open a supplier for its calculator." />
      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Rank</th><th>Supplier</th><th>City</th><th>Phone</th><th></th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td><span className="rank-pill">{s.manual_rank ? `L${s.manual_rank}` : '—'}</span></td>
                  <td><Link href={`/suppliers/${s.id}`} className="cell-main" style={{ color: 'var(--copper-text)' }}>{s.name}</Link></td>
                  <td>{s.city ?? '—'}</td>
                  <td className="mono">{s.phone ?? '—'}</td>
                  <td><Link href={`/suppliers/${s.id}`} className="btn-order outline">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="help">Monthly targets, manual ranking and the per-supplier calculator arrive in the next updates. Rank and contact are live now.</div>
    </>
  );
}
