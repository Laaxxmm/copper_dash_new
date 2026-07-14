'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { evalFormula, KIND_LABEL, OP_LABEL, OP_SYMBOL, type PriceLine, type LineKind, type LineOp } from '@/lib/sale-formula';
import { saveTemplate } from '@/lib/sale-actions';

const KINDS: LineKind[] = ['BUY_COST', 'FABRICATION', 'FIXED', 'PERCENT'];
const OPS: LineOp[] = ['ADD', 'SUB', 'MUL', 'DIV', 'AVG'];
const blank: PriceLine = { label: '', kind: 'FIXED', operator: 'ADD', value: 0 };

export default function TemplateBuilder({ id, name: name0, notes: notes0, lines: lines0 }: {
  id: number; name: string; notes: string; lines: PriceLine[];
}) {
  const router = useRouter();
  const [name, setName] = useState(name0);
  const [notes, setNotes] = useState(notes0);
  const [lines, setLines] = useState<PriceLine[]>(lines0.length ? lines0 : [{ label: 'Copper cost', kind: 'BUY_COST', operator: 'ADD', value: 0 }]);
  const [buy, setBuy] = useState(950);
  const [fab, setFab] = useState(18);

  const set = (i: number, patch: Partial<PriceLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const add = () => setLines((ls) => [...ls, { ...blank, label: 'New cost' }]);
  const remove = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i));
  const move = (i: number, d: -1 | 1) => setLines((ls) => {
    const j = i + d; if (j < 0 || j >= ls.length) return ls;
    const c = [...ls]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });

  const { price, steps } = evalFormula(lines, { buy_cost: buy, fabrication: fab });

  return (
    <form action={saveTemplate} className="tb">
      <input type="hidden" name="template_id" value={id} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />

      <div className="card card-pad">
        <div className="form-grid">
          <label className="wide">Template name<input name="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Fine wire — standard markup" /></label>
          <label className="wide">Notes<input name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="when to use this template" /></label>
        </div>

        <div className="tb-lines">
          {lines.map((l, i) => {
            const usesValue = l.kind === 'FIXED' || l.kind === 'PERCENT';
            return (
              <div className="tb-row" key={i}>
                <span className="tb-seq">{i === 0 ? 'start' : OP_SYMBOL[l.operator]}</span>
                <input className="tb-label" value={l.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="label" />
                <select value={l.kind} onChange={(e) => set(i, { kind: e.target.value as LineKind })}>
                  {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
                {i > 0 ? (
                  <select value={l.operator} onChange={(e) => set(i, { operator: e.target.value as LineOp })}>
                    {OPS.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
                  </select>
                ) : <span className="tb-op-fixed">initial value</span>}
                {usesValue
                  ? <input className="tb-val" type="number" step="0.01" value={l.value} onChange={(e) => set(i, { value: Number(e.target.value) })} placeholder={l.kind === 'PERCENT' ? '%' : '₹/kg'} />
                  : <span className="tb-val muted">from {l.kind === 'BUY_COST' ? 'purchase' : 'product'}</span>}
                <span className="tb-btns">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="up">↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === lines.length - 1} title="down">↓</button>
                  <button type="button" onClick={() => remove(i)} disabled={lines.length === 1} title="remove">✕</button>
                </span>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn-order outline" onClick={add}>+ Add cost line</button>
      </div>

      <div className="card card-pad tb-preview">
        <div className="card-title">Live preview</div>
        <div className="tb-inputs">
          <label>Buy cost ₹/kg<input type="number" step="0.01" value={buy} onChange={(e) => setBuy(Number(e.target.value))} /></label>
          <label>Fabrication ₹/kg<input type="number" step="0.01" value={fab} onChange={(e) => setFab(Number(e.target.value))} /></label>
        </div>
        <table className="data compact">
          <tbody>
            {steps.map((s, i) => (
              <tr key={i}>
                <td>{s.op === 'start' ? 'start' : OP_SYMBOL[s.op as LineOp]}</td>
                <td>{s.label || KIND_LABEL[s.kind]}</td>
                <td className="num">{s.resolved.toFixed(2)}</td>
                <td className="num"><b>{s.running.toFixed(2)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="tb-price">Selling price <b>₹{price.toFixed(2)}/kg</b></div>
      </div>

      <div className="tb-actions">
        <button type="submit" className="btn">Save template</button>
        <button type="button" className="btn-order outline" onClick={() => router.push('/sales/pricing')}>Cancel</button>
      </div>
    </form>
  );
}
