// Phase 2 — requirement/split queries. A requirement is a monthly need; its
// allocations are the supplier legs. Sourced/remaining and blended cost are
// derived live. Per the pricing principle, "booked" cost (a priced booking) is
// final; an allocation's own rate is provisional until then.
import { all, get } from './db';

export type RequirementRow = {
  id: number; req_no: string; customer: string | null; product_desc: string; product_id: number;
  qty_mt: number; sourced: number; remaining: number; status: string;
  need_by_date: string | null; created_date: string; target_sell_inr_kg: number | null; alloc_count: number;
};

const SOURCED = `IFNULL((SELECT SUM(qty_mt) FROM allocations a WHERE a.requirement_id = r.id AND a.status != 'CANCELLED'), 0)`;

export function requirements(): RequirementRow[] {
  return all<RequirementRow>(
    `SELECT r.id, r.req_no, cp.name customer, pr.description product_desc, r.product_id,
            r.qty_mt, ${SOURCED} sourced, ROUND(r.qty_mt - ${SOURCED}, 2) remaining,
            r.status, r.need_by_date, r.created_date, r.target_sell_inr_kg,
            (SELECT COUNT(*) FROM allocations a WHERE a.requirement_id = r.id AND a.status != 'CANCELLED') alloc_count
     FROM requirements r
     LEFT JOIN parties cp ON cp.id = r.customer_id
     JOIN products pr ON pr.id = r.product_id
     ORDER BY r.created_date DESC, r.id DESC`);
}

export function requirement(id: number) {
  return get<RequirementRow & { customer_id: number | null; notes: string | null }>(
    `SELECT r.id, r.req_no, r.customer_id, cp.name customer, pr.description product_desc, r.product_id,
            r.qty_mt, ${SOURCED} sourced, ROUND(r.qty_mt - ${SOURCED}, 2) remaining,
            r.status, r.need_by_date, r.created_date, r.target_sell_inr_kg, r.notes,
            (SELECT COUNT(*) FROM allocations a WHERE a.requirement_id = r.id AND a.status != 'CANCELLED') alloc_count
     FROM requirements r
     LEFT JOIN parties cp ON cp.id = r.customer_id
     JOIN products pr ON pr.id = r.product_id
     WHERE r.id = ?`, id);
}

export type AllocationRow = {
  id: number; requirement_id: number; supplier_id: number; supplier: string; supplier_email: string | null;
  tier_label: string | null; qty_mt: number; rate_inr_kg: number | null; status: string; sent_at: string | null;
  booking_id: number | null; booking_no: string | null;
  booked_rate_inr_kg: number | null;  // final rate from the linked booking's fixations, if priced
};

export function allocations(requirementId: number): AllocationRow[] {
  return all<AllocationRow>(
    `SELECT a.id, a.requirement_id, a.supplier_id, sp.name supplier, sp.email supplier_email,
            a.tier_label, a.qty_mt, a.rate_inr_kg, a.status, a.sent_at, a.booking_id, b.booking_no,
            (SELECT ROUND(SUM(f.qty_mt * f.price_inr_mt) / SUM(f.qty_mt) / 1000, 2)
             FROM price_fixations f WHERE f.booking_id = a.booking_id) booked_rate_inr_kg
     FROM allocations a
     JOIN parties sp ON sp.id = a.supplier_id
     LEFT JOIN bookings b ON b.id = a.booking_id
     WHERE a.requirement_id = ?
     ORDER BY a.rate_inr_kg IS NULL, a.rate_inr_kg, a.id`, requirementId);
}

/** Ordering-slip mailto: opens the client's own mail app, pre-addressed and pre-filled. */
export function enquiryMailto(o: {
  email: string | null; supplier: string; reqNo: string; product: string; qty: number; needBy: string | null; rate: number | null;
}): string {
  const subject = `Enquiry ${o.reqNo}: ${o.qty} MT ${o.product}`;
  const body = [
    `Dear ${o.supplier},`, '',
    `We wish to book the following against our requirement ${o.reqNo}:`,
    `  Product : ${o.product}`,
    `  Quantity: ${o.qty} MT`,
    o.needBy ? `  Need by : ${o.needBy}` : '',
    o.rate ? `  Indicative rate: ₹${o.rate.toFixed(2)}/kg` : '',
    '', 'Please send your PI. Thank you.',
  ].filter(Boolean).join('\n');
  return `mailto:${o.email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Blended cost: provisional over all live legs; booked over legs with a priced booking. */
export function blended(requirementId: number) {
  const rows = allocations(requirementId).filter((a) => a.status !== 'CANCELLED');
  const wavg = (list: AllocationRow[], pick: (a: AllocationRow) => number | null) => {
    let q = 0, v = 0;
    for (const a of list) {
      const r = pick(a);
      if (r == null) continue;
      q += a.qty_mt; v += a.qty_mt * r;
    }
    return q > 0 ? { rate: Math.round((v / q) * 100) / 100, qty: Math.round(q * 100) / 100 } : { rate: null, qty: 0 };
  };
  const provisional = wavg(rows, (a) => a.booked_rate_inr_kg ?? a.rate_inr_kg);
  const booked = wavg(rows.filter((a) => a.booked_rate_inr_kg != null), (a) => a.booked_rate_inr_kg);
  const unbookedQty = Math.round(rows.filter((a) => a.booked_rate_inr_kg == null).reduce((s, a) => s + a.qty_mt, 0) * 100) / 100;
  return { provisional, booked, unbookedQty };
}
