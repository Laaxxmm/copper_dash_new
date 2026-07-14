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
/** Open purchase lots we can sell from — each carries its buy rate + basis (for the link). */
export function openPurchaseLots() {
  return all<{ id: number; booking_no: string; supplier: string; product_id: number | null; product: string | null; buy_basis: string; buy_rate_mt: number | null; available: number }>(
    `SELECT b.id, b.booking_no, p.name supplier, pr.id product_id, pr.description product, b.pricing_basis buy_basis,
            (SELECT SUM(qty_mt * price_inr_mt) / SUM(qty_mt) FROM price_fixations WHERE booking_id = b.id) buy_rate_mt,
            ROUND(b.qty_mt - IFNULL((SELECT SUM(qty_mt) FROM liftings WHERE booking_id = b.id), 0), 2) available
     FROM bookings b JOIN parties p ON p.id = b.party_id LEFT JOIN products pr ON pr.id = b.product_id
     WHERE b.kind = 'PURCHASE' AND b.status = 'OPEN'
     ORDER BY b.booking_date DESC`);
}

export type SalePIFull = {
  id: number; pi_no: string; customer_id: number; customer_name: string; customer_city: string | null;
  customer_gstin: string | null; customer_email: string | null; product_name: string | null;
  qty_mt: number; rate_inr_kg: number; base_amount: number; tax_amount: number; gross_amount: number;
  basis: string | null; status: string; created_date: string; cancelled_date: string | null;
  booking_no: string | null; source_no: string | null; source_supplier: string | null; source_basis: string | null;
};
export function salePIFull(id: number): SalePIFull | undefined {
  return get<SalePIFull>(
    `SELECT pi.id, pi.pi_no, pi.customer_id, c.name customer_name, c.city customer_city, c.gstin customer_gstin,
            c.email customer_email, sp.name product_name, pi.qty_mt, pi.rate_inr_kg, pi.base_amount, pi.tax_amount,
            pi.gross_amount, pi.basis, pi.status, pi.created_date, pi.cancelled_date,
            b.booking_no, src.booking_no source_no, srcp.name source_supplier, src.pricing_basis source_basis
     FROM sales_pi pi JOIN parties c ON c.id = pi.customer_id
     LEFT JOIN sale_products sp ON sp.id = pi.sale_product_id
     LEFT JOIN bookings b ON b.id = pi.booking_id
     LEFT JOIN bookings src ON src.id = b.linked_booking_id
     LEFT JOIN parties srcp ON srcp.id = src.party_id
     WHERE pi.id = ?`, id);
}

export function customerSalePIs(customerId: number) {
  return all<{ id: number; pi_no: string; product_name: string | null; qty_mt: number; rate_inr_kg: number; gross_amount: number; basis: string | null; status: string; customer_po: string | null; created_date: string }>(
    `SELECT pi.id, pi.pi_no, sp.name product_name, pi.qty_mt, pi.rate_inr_kg, pi.gross_amount, pi.basis,
            pi.status, pi.customer_po, pi.created_date
     FROM sales_pi pi LEFT JOIN sale_products sp ON sp.id = pi.sale_product_id
     WHERE pi.customer_id = ? ORDER BY pi.created_date DESC, pi.id DESC`, customerId);
}

export function salePIList() {
  return all<{ id: number; pi_no: string; customer: string; product_name: string | null; qty_mt: number; rate_inr_kg: number; gross_amount: number; basis: string | null; status: string; created_date: string }>(
    `SELECT pi.id, pi.pi_no, c.name customer, sp.name product_name, pi.qty_mt, pi.rate_inr_kg, pi.gross_amount,
            pi.basis, pi.status, pi.created_date
     FROM sales_pi pi JOIN parties c ON c.id = pi.customer_id LEFT JOIN sale_products sp ON sp.id = pi.sale_product_id
     ORDER BY pi.created_date DESC, pi.id DESC`);
}

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
