// DB queries for the saved pricing templates + customer products. The pure
// formula/evaluator lives in ./sale-formula (no DB) and is re-exported here for
// server-side convenience.
import { all, get } from './db';
import type { PriceLine } from './sale-formula';
export * from './sale-formula';

// ---------- queries ----------
export type Template = { id: number; name: string; notes: string | null; line_count: number };
export function priceTemplates(): Template[] {
  return all<Template>(
    `SELECT t.id, t.name, t.notes, (SELECT COUNT(*) FROM price_lines WHERE template_id = t.id) line_count
     FROM price_templates t ORDER BY t.name`);
}
export function templateWithLines(id: number): { id: number; name: string; notes: string | null; lines: PriceLine[] } | null {
  const t = get<{ id: number; name: string; notes: string | null }>(`SELECT id, name, notes FROM price_templates WHERE id = ?`, id);
  if (!t) return null;
  const lines = all<PriceLine>(`SELECT label, kind, operator, value FROM price_lines WHERE template_id = ? ORDER BY seq`, id);
  return { ...t, lines };
}

export type SaleProductRow = {
  id: number; name: string; customer_id: number; customer: string; raw_product_id: number | null;
  raw_desc: string | null; template_id: number | null; template_name: string | null; fabrication_cost: number;
};
export function saleProducts(customerId?: number): SaleProductRow[] {
  const where = customerId ? `AND sp.customer_id = ?` : '';
  return all<SaleProductRow>(
    `SELECT sp.id, sp.name, sp.customer_id, c.name customer, sp.raw_product_id, pr.description raw_desc,
            sp.template_id, t.name template_name, sp.fabrication_cost
     FROM sale_products sp JOIN parties c ON c.id = sp.customer_id
     LEFT JOIN products pr ON pr.id = sp.raw_product_id
     LEFT JOIN price_templates t ON t.id = sp.template_id
     WHERE sp.active = 1 ${where} ORDER BY c.name, sp.name`, ...(customerId ? [customerId] : []));
}
