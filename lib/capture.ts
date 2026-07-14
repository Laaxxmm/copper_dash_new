// Phase 4 — inbound PI/PO capture. parseDoc() is pure (regex over pasted email/
// PDF text) so it's deterministic and testable; the DB helpers match a parsed
// doc to an open enquiry and list the pending review queue.
//
// ponytail: transport (IMAP/Gmail polling) and an LLM extractor are deferred —
// paste-the-text is the ingest for now; a mailbox just feeds the same parseDoc()
// later. Nothing posts to the ledger without a human confirming (see §3.2).
import { all, get } from './db';
import { ratePerKg } from './formula';

export type ParsedDoc = {
  doc_type: 'PI' | 'PO' | 'INVOICE' | 'CANCEL' | 'UNKNOWN';
  reference_no: string | null;
  qty_mt: number | null;
  lme_usd_mt: number | null; premium_usd_mt: number | null; transaction_usd_mt: number | null;
  factor_pct: number | null; exchange_rate: number | null; handling_inr_mt: number | null;
  stated_total: number | null;
  computed_rate_inr_kg: number | null;
  computed_total: number | null;
  mismatch: boolean;             // stated total vs recomputed total off by > 1%
};

const numAfter = (text: string, re: RegExp): number | null => {
  const m = text.match(re);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ''));
  return isFinite(v) ? v : null;
};

export function parseDoc(text: string): ParsedDoc {
  const t = text.replace(/\s+/g, ' ');
  const doc_type: ParsedDoc['doc_type'] =
    /\bcancel(?:led|ed)?\b|\brevoke/i.test(t) ? 'CANCEL'
      : /proforma\s+invoice|\bP\.?I\.?\s*(?:no|number|#)/i.test(t) ? 'PI'
        : /purchase\s+order|\bP\.?O\.?\s*(?:no|number|#)/i.test(t) ? 'PO'
          : /tax\s+invoice/i.test(t) ? 'INVOICE' : 'UNKNOWN';

  const refM = t.match(/(?:proforma invoice|purchase order|invoice|reference|ref|order)\s*(?:no\.?|number|#)?\s*:?\s*([A-Z0-9][A-Z0-9\/-]{4,})/i);
  const reference_no = refM ? refM[1] : null;

  const qty_kg = numAfter(t, /([\d,]+(?:\.\d+)?)\s*KG\b/i);
  const qty_mt = qty_kg != null ? Math.round((qty_kg / 1000) * 1000) / 1000 : numAfter(t, /([\d,]+(?:\.\d+)?)\s*MT\b/i);

  const lme_usd_mt = numAfter(t, /LME[^0-9]*USD[^0-9]*([\d,]+\.?\d*)/i);
  const premium_usd_mt = numAfter(t, /Premium[^0-9]*USD[^0-9]*([\d,]+\.?\d*)/i);
  const transaction_usd_mt = numAfter(t, /Transaction[^0-9]*USD[^0-9]*([\d,]+\.?\d*)/i);
  const exchange_rate = numAfter(t, /Exchange[^0-9]*@?\s*([\d,]+\.?\d*)/i);
  const factor_pct = numAfter(t, /Factor[^0-9]*([\d,]+\.?\d*)\s*%/i);
  const handling_inr_mt = numAfter(t, /Handling[^0-9]*INR[^0-9]*([\d,]+\.?\d*)/i);
  const stated_total = numAfter(t, /(?:Total(?:\s+Net)?\s+Value|Grand\s+Total|Total)\s*:?\s*(?:INR)?\s*([\d,]+\.?\d*)/i);

  let computed_rate_inr_kg: number | null = null;
  let computed_total: number | null = null;
  if (lme_usd_mt != null && exchange_rate != null) {
    computed_rate_inr_kg = ratePerKg({
      lme_usd_mt, premium_usd_mt: premium_usd_mt ?? 0, transaction_usd_mt: transaction_usd_mt ?? 0,
      factor_pct: factor_pct ?? 0, exchange_rate, handling_inr_mt: handling_inr_mt ?? 0,
    });
    if (qty_kg != null) computed_total = Math.round(computed_rate_inr_kg * qty_kg * 1.18 * 100) / 100;
  }
  // Guardrail: recompute from the components and compare to what the PI printed.
  const mismatch = doc_type !== 'CANCEL' && stated_total != null && computed_total != null &&
    Math.abs(stated_total - computed_total) / stated_total > 0.01;

  return {
    doc_type, reference_no, qty_mt, lme_usd_mt, premium_usd_mt, transaction_usd_mt,
    factor_pct, exchange_rate, handling_inr_mt, stated_total, computed_rate_inr_kg, computed_total, mismatch,
  };
}

export type Match = { allocation_id: number; requirement_id: number; req_no: string; supplier: string; qty_mt: number };

/** Match a parsed doc to an open ENQUIRY leg: supplier name in the text, quantity within tolerance. */
export function matchAllocation(parsed: ParsedDoc, rawText: string): Match | null {
  const enquiries = all<{ allocation_id: number; requirement_id: number; req_no: string; supplier: string; qty_mt: number }>(
    `SELECT a.id allocation_id, a.requirement_id, r.req_no, p.name supplier, a.qty_mt
     FROM allocations a JOIN parties p ON p.id = a.supplier_id JOIN requirements r ON r.id = a.requirement_id
     WHERE a.status = 'ENQUIRY'`);
  const low = rawText.toLowerCase();
  const named = enquiries.filter((e) => low.includes(e.supplier.split(/[ (]/)[0].toLowerCase()));
  const pool = named.length ? named : enquiries;
  return pool.find((e) => parsed.qty_mt != null && Math.abs(e.qty_mt - parsed.qty_mt) <= 0.5) ?? null;
}

export type SupplierMatch = { supplier_id: number; supplier: string; how: string };

/** Map an incoming PI/PO to a supplier — by the sender's email domain, then a
 *  configured keyword, then the firm name. This is the mailbox "which supplier
 *  is this from" step; the domain/keyword map lives on the supplier record. */
export function matchSupplier(rawText: string): SupplierMatch | null {
  const low = rawText.toLowerCase();
  const domains = [...rawText.matchAll(/@([a-z0-9.-]+\.[a-z]{2,})/gi)].map((m) => m[1].toLowerCase());
  const suppliers = all<{ id: number; name: string; email: string | null; mail_keywords: string | null }>(
    `SELECT id, name, email, mail_keywords FROM parties WHERE type = 'SUPPLIER'`);
  // 1) email domain
  for (const s of suppliers) {
    const d = s.email?.split('@')[1]?.toLowerCase();
    if (d && domains.includes(d)) return { supplier_id: s.id, supplier: s.name, how: `domain @${d}` };
  }
  // 2) configured keyword
  for (const s of suppliers) {
    const kws = (s.mail_keywords ?? '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
    const hit = kws.find((k) => low.includes(k));
    if (hit) return { supplier_id: s.id, supplier: s.name, how: `keyword "${hit}"` };
  }
  // 3) firm name (first significant word)
  for (const s of suppliers) {
    const word = s.name.split(/[ (]/)[0].toLowerCase();
    if (word.length > 3 && low.includes(word)) return { supplier_id: s.id, supplier: s.name, how: 'name' };
  }
  return null;
}

/** Map an incoming PO to a customer — same domain → keyword → name logic as suppliers. */
export function matchCustomer(rawText: string): SupplierMatch | null {
  const low = rawText.toLowerCase();
  const domains = [...rawText.matchAll(/@([a-z0-9.-]+\.[a-z]{2,})/gi)].map((m) => m[1].toLowerCase());
  const customers = all<{ id: number; name: string; email: string | null; mail_keywords: string | null }>(
    `SELECT id, name, email, mail_keywords FROM parties WHERE type = 'CUSTOMER'`);
  for (const c of customers) {
    const d = c.email?.split('@')[1]?.toLowerCase();
    if (d && domains.includes(d)) return { supplier_id: c.id, supplier: c.name, how: `domain @${d}` };
  }
  for (const c of customers) {
    const kws = (c.mail_keywords ?? '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
    const hit = kws.find((k) => low.includes(k));
    if (hit) return { supplier_id: c.id, supplier: c.name, how: `keyword "${hit}"` };
  }
  for (const c of customers) {
    const word = c.name.split(/[ (]/)[0].toLowerCase();
    if (word.length > 3 && low.includes(word)) return { supplier_id: c.id, supplier: c.name, how: 'name' };
  }
  return null;
}

/** Guess the product from the document text (size in mm + wire/rod). */
export function detectProductId(rawText: string): number | null {
  const t = rawText.toLowerCase();
  const isRod = /\brod\b/.test(t);
  const isWire = /\bwire\b/.test(t);
  const sizeM = t.match(/([\d.]+)\s*mm/);
  const size = sizeM ? parseFloat(sizeM[1]) : null;
  const type = isRod ? 'ROD' : isWire ? 'WIRE' : null;
  if (size != null && type) {
    const row = get<{ id: number }>(`SELECT id FROM products WHERE type = ? AND ABS(size_mm - ?) < 0.01`, type, size);
    if (row) return row.id;
  }
  if (type) return get<{ id: number }>(`SELECT id FROM products WHERE type = ? ORDER BY size_mm LIMIT 1`, type)?.id ?? null;
  return null;
}

/** Find a SENT purchase order referenced by a cancellation (by PO number). */
export function poByReference(ref: string | null): { id: number; po_no: string } | null {
  if (!ref) return null;
  return get<{ id: number; po_no: string }>(
    `SELECT id, po_no FROM purchase_orders WHERE status = 'SENT' AND UPPER(po_no) = UPPER(?)`, ref) ?? null;
}

export type CaptureRow = {
  id: number; received_at: string; doc_type: string; reference_no: string | null; status: string;
  matched_allocation_id: number | null; matched_requirement_id: number | null; req_no: string | null;
  matched_supplier_id: number | null; supplier: string | null;
  matched_product_id: number | null; product_desc: string | null;
  extracted_json: string; raw_ref: string;
};

export function pendingCaptures(): CaptureRow[] {
  return all<CaptureRow>(
    `SELECT c.id, c.received_at, c.doc_type, c.reference_no, c.status,
            c.matched_allocation_id, c.matched_requirement_id, r.req_no,
            c.matched_supplier_id, IFNULL(sp.name, ap.name) supplier,
            c.matched_product_id, pr.description product_desc,
            c.extracted_json, c.raw_ref
     FROM email_captures c
     LEFT JOIN allocations a ON a.id = c.matched_allocation_id
     LEFT JOIN requirements r ON r.id = c.matched_requirement_id
     LEFT JOIN parties ap ON ap.id = a.supplier_id
     LEFT JOIN parties sp ON sp.id = c.matched_supplier_id
     LEFT JOIN products pr ON pr.id = c.matched_product_id
     WHERE c.status IN ('PENDING','MISMATCH') AND c.matched_customer_id IS NULL
     ORDER BY c.id DESC`);
}

export type CustomerCaptureRow = {
  id: number; doc_type: string; reference_no: string | null; status: string;
  matched_customer_id: number | null; customer: string | null; extracted_json: string;
};
/** Customer-side captures (their POs) awaiting review. */
export function pendingCustomerCaptures(): CustomerCaptureRow[] {
  return all<CustomerCaptureRow>(
    `SELECT c.id, c.doc_type, c.reference_no, c.status, c.matched_customer_id, p.name customer, c.extracted_json
     FROM email_captures c LEFT JOIN parties p ON p.id = c.matched_customer_id
     WHERE c.status IN ('PENDING','MISMATCH') AND c.matched_customer_id IS NOT NULL
     ORDER BY c.id DESC`);
}
