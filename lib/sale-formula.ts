// Pure sale-price formula: ordered cost-lines, each with a kind (what the value
// is) and an operator (how it folds into the running ₹/kg). No DB import, so it's
// safe in client components, the server, and tests alike.

export type LineKind = 'BUY_COST' | 'FABRICATION' | 'FIXED' | 'PERCENT';
export type LineOp = 'ADD' | 'SUB' | 'MUL' | 'DIV' | 'AVG';
export type PriceLine = { label: string; kind: LineKind; operator: LineOp; value: number };
export type FormulaInputs = { buy_cost: number; fabrication: number };
export type EvalStep = { label: string; kind: LineKind; op: LineOp | 'start'; resolved: number; running: number };

export const KIND_LABEL: Record<LineKind, string> = {
  BUY_COST: 'Buy cost', FABRICATION: 'Fabrication', FIXED: 'Fixed ₹/kg', PERCENT: '% of running',
};
export const OP_LABEL: Record<LineOp, string> = { ADD: 'add', SUB: 'subtract', MUL: 'multiply', DIV: 'divide', AVG: 'average with' };
export const OP_SYMBOL: Record<LineOp, string> = { ADD: '+', SUB: '−', MUL: '×', DIV: '÷', AVG: 'avg' };

const p2 = (n: number) => Math.round(n * 100) / 100;

/** Evaluate the lines top-to-bottom into a selling ₹/kg, returning each step for the preview.
 *  The first line seeds the running total; later lines apply their operator. PERCENT resolves
 *  to (running × value/100) — so PERCENT+ADD is a markup of value%. */
export function evalFormula(lines: PriceLine[], inputs: FormulaInputs): { price: number; steps: EvalStep[] } {
  let running = 0;
  const steps: EvalStep[] = [];
  lines.forEach((ln, i) => {
    const resolved =
      ln.kind === 'BUY_COST' ? inputs.buy_cost
        : ln.kind === 'FABRICATION' ? inputs.fabrication
          : ln.kind === 'PERCENT' ? (running * ln.value) / 100
            : ln.value; // FIXED
    if (i === 0) running = resolved;
    else switch (ln.operator) {
      case 'ADD': running += resolved; break;
      case 'SUB': running -= resolved; break;
      case 'MUL': running *= resolved; break;
      case 'DIV': running = resolved !== 0 ? running / resolved : running; break;
      case 'AVG': running = (running + resolved) / 2; break;
    }
    running = p2(running);
    steps.push({ label: ln.label, kind: ln.kind, op: i === 0 ? 'start' : ln.operator, resolved: p2(resolved), running });
  });
  return { price: running, steps };
}
