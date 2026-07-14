import Link from 'next/link';
import { PageHead } from '@/components/ui';
import { expensesList, profitability, customerProfitability } from '@/lib/queries';
import { addExpense, deleteExpense } from '@/lib/finance-actions';
import { inr, monthLabel, today } from '@/lib/format';

export const dynamic = 'force-dynamic';

const CATEGORIES = ['Salary', 'Rent', 'Power', 'Transport', 'Interest', 'Office', 'Other'];

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ month?: string; err?: string }> }) {
  const sp = await searchParams;
  const month = sp.month || today().slice(0, 7);
  const expenses = expensesList(month);
  const pnl = profitability(month);
  const perCustomer = customerProfitability(month);
  const totalExp = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <PageHead title="Finance" sub="Record overheads, and see the real profit after every cost — overall and per customer." />
      {sp.err ? <div className="form-error">⚠ {sp.err}</div> : null}

      <form className="month-pick" method="get">
        <label>Month <input type="month" name="month" defaultValue={month} /></label>
        <button className="btn-sm" type="submit">View</button>
        <span className="month-now">{monthLabel(month)}</span>
      </form>

      <div className="grid tiles">
        <div className="card tile"><div className="t-label">Gross margin</div><div className="t-value">{inr(pnl.grossMargin)}</div><div className="t-note">{pnl.deals} deals this month</div></div>
        <div className="card tile"><div className="t-label">Overheads</div><div className="t-value">{inr(pnl.overheads)}</div><div className="t-note">salary, rent, power…</div></div>
        <div className={`card tile accent${pnl.net < 0 ? ' t-bad' : ' t-good'}`}><div className="t-label">Net profit</div><div className="t-value">{inr(pnl.net)}</div><div className="t-note">gross margin − overheads</div></div>
      </div>

      <div className="grid two-col section-gap" style={{ alignItems: 'start' }}>
        <div>
          <div className="section-title">Overheads — {monthLabel(month)}</div>
          <div className="card">
            {expenses.length === 0 ? (
              <p className="card-pad muted">No overheads recorded for this month. Add them below so profit is real.</p>
            ) : (
              <div className="table-wrap">
                <table className="data compact">
                  <thead><tr><th>Category</th><th>Notes</th><th className="num">Amount</th><th></th></tr></thead>
                  <tbody>
                    {expenses.map((e) => (
                      <tr key={e.id}>
                        <td className="cell-main">{e.category}</td>
                        <td className="muted">{e.notes ?? '—'}</td>
                        <td className="num">{inr(e.amount)}</td>
                        <td><form action={deleteExpense}><input type="hidden" name="expense_id" value={e.id} /><button className="btn-order skip" type="submit">✕</button></form></td>
                      </tr>
                    ))}
                    <tr><td colSpan={2}><b>Total</b></td><td className="num"><b>{inr(totalExp)}</b></td><td></td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <form action={addExpense} className="card card-pad form section-gap-sm">
            <div className="card-title">Add an overhead</div>
            <div className="form-grid">
              <input type="hidden" name="month" value={month} />
              <label>Category
                <select name="category" defaultValue="Salary">{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              </label>
              <label>Amount (₹)<input name="amount" type="number" step="1000" min="0" required /></label>
              <label className="wide">Notes<input name="notes" type="text" placeholder="optional" /></label>
            </div>
            <button type="submit" className="btn btn-sm">Add overhead</button>
          </form>
        </div>

        <div>
          <div className="section-title">Profit by customer — {monthLabel(month)}</div>
          <div className="card">
            {perCustomer.length === 0 ? (
              <p className="card-pad muted">No matched deals this month.</p>
            ) : (
              <div className="table-wrap">
                <table className="data compact">
                  <thead><tr><th>Customer</th><th className="num">Margin</th><th className="num">Overhead</th><th className="num">Net</th></tr></thead>
                  <tbody>
                    {perCustomer.map((c) => (
                      <tr key={c.customer_id}>
                        <td><Link href={`/sales/customers/${c.customer_id}`} className="cell-main" style={{ color: 'var(--copper-text)' }}>{c.customer}</Link></td>
                        <td className="num">{inr(c.margin)}</td>
                        <td className="num muted">−{inr(c.overhead_share)}</td>
                        <td className="num" style={{ color: c.net < 0 ? 'var(--bad)' : 'var(--good)', fontWeight: 700 }}>{inr(c.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="chart-note" style={{ padding: '0 16px 14px' }}>Overheads are shared across customers by their revenue this month.</p>
          </div>
        </div>
      </div>
    </>
  );
}
