'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { get, run } from './db';
import { today } from './format';
import type { PriceLine, LineKind, LineOp } from './sale-formula';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const num = (fd: FormData, k: string) => Number(fd.get(k) ?? 0);
const refresh = () => revalidatePath('/', 'layout');

const KINDS: LineKind[] = ['BUY_COST', 'FABRICATION', 'FIXED', 'PERCENT'];
const OPS: LineOp[] = ['ADD', 'SUB', 'MUL', 'DIV', 'AVG'];

/** Create or update a reusable pricing template + its ordered lines (posted as JSON). */
export async function saveTemplate(fd: FormData) {
  const id = num(fd, 'template_id');
  const name = str(fd, 'name') || 'Untitled template';
  const notes = str(fd, 'notes') || null;
  let lines: PriceLine[] = [];
  try { lines = JSON.parse(str(fd, 'lines')); } catch { lines = []; }
  lines = lines
    .filter((l) => KINDS.includes(l.kind) && OPS.includes(l.operator))
    .map((l) => ({ label: String(l.label ?? '').slice(0, 60) || 'Line', kind: l.kind, operator: l.operator, value: Number(l.value) || 0 }));
  if (!lines.length) redirect('/sales/pricing?err=' + encodeURIComponent('Add at least one line.'));

  let tid = id;
  if (id) {
    run(`UPDATE price_templates SET name = ?, notes = ? WHERE id = ?`, name, notes, id);
    run(`DELETE FROM price_lines WHERE template_id = ?`, id);
  } else {
    tid = Number(run(`INSERT INTO price_templates (name, notes, created_date) VALUES (?,?,?)`, name, notes, today()).lastInsertRowid);
  }
  const ins = (seq: number, l: PriceLine) =>
    run(`INSERT INTO price_lines (template_id, seq, label, kind, operator, value) VALUES (?,?,?,?,?,?)`, tid, seq, l.label, l.kind, l.operator, l.value);
  lines.forEach((l, i) => ins(i, l));
  refresh();
  redirect('/sales/pricing');
}

export async function deleteTemplate(fd: FormData) {
  const id = num(fd, 'template_id');
  if (id && !get(`SELECT id FROM sale_products WHERE template_id = ? AND active = 1`, id)) {
    run(`DELETE FROM price_lines WHERE template_id = ?`, id);
    run(`DELETE FROM price_templates WHERE id = ?`, id);
  }
  refresh();
  redirect('/sales/pricing');
}

/** Add a product a customer buys, priced by a template + its own fabrication cost. */
export async function saveSaleProduct(fd: FormData) {
  const customer = num(fd, 'customer_id');
  const name = str(fd, 'name');
  if (!customer || name.length < 2) redirect('/sales/pricing?err=' + encodeURIComponent('Pick a customer and name the product.'));
  run(`INSERT INTO sale_products (customer_id, name, raw_product_id, template_id, fabrication_cost, notes, active, created_date)
       VALUES (?,?,?,?,?,?,1,?)`,
    customer, name, num(fd, 'raw_product_id') || null, num(fd, 'template_id') || null,
    Math.max(0, num(fd, 'fabrication_cost')), str(fd, 'notes') || null, today());
  refresh();
  redirect('/sales/pricing');
}

export async function deleteSaleProduct(fd: FormData) {
  run(`UPDATE sale_products SET active = 0 WHERE id = ?`, num(fd, 'product_id'));
  refresh();
  redirect('/sales/pricing');
}
