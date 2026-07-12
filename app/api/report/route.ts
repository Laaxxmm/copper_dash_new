// Excel report downloads: /api/report?type=<type>&from=YYYY-MM-DD&to=YYYY-MM-DD
// Types: bookings | bills | payments | trucks | profit | ledger (needs &party=<id>) | all
import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { all, get } from '@/lib/db';
import { BASIS_LABEL, TRUCK_LABEL } from '@/lib/format';

export const dynamic = 'force-dynamic';

type Row = Record<string, string | number | null>;

function bookingsRows(from: string, to: string): Row[] {
  return all(
    `SELECT b.booking_no, b.kind, p.name party, b.booking_date, b.qty_mt, b.pricing_basis,
            b.premium_inr_mt, b.lift_by_date, b.status,
            IFNULL(f.q, 0) fixed_qty, f.rate avg_rate, IFNULL(l.q, 0) lifted_qty, IFNULL(i.amt, 0) billed
     FROM bookings b JOIN parties p ON p.id = b.party_id
     LEFT JOIN (SELECT booking_id, SUM(qty_mt) q, SUM(qty_mt*price_inr_mt)/SUM(qty_mt) rate FROM price_fixations GROUP BY booking_id) f ON f.booking_id = b.id
     LEFT JOIN (SELECT booking_id, SUM(qty_mt) q FROM liftings GROUP BY booking_id) l ON l.booking_id = b.id
     LEFT JOIN (SELECT booking_id, SUM(total_amount) amt FROM invoices GROUP BY booking_id) i ON i.booking_id = b.id
     WHERE b.booking_date BETWEEN ? AND ?
     ORDER BY b.booking_date`, from, to,
  ).map((r) => ({
    'Booking No': r.booking_no as string,
    'Type': r.kind === 'PURCHASE' ? 'Bought' : 'Sold',
    'Party': r.party as string,
    'Date': r.booking_date as string,
    'Quantity (MT)': r.qty_mt as number,
    'Price Basis': BASIS_LABEL[r.pricing_basis as string] ?? (r.pricing_basis as string),
    'Premium (₹/MT)': r.premium_inr_mt as number,
    'Priced Qty (MT)': r.fixed_qty as number,
    'Avg Rate (₹/MT)': r.avg_rate != null ? Math.round(r.avg_rate as number) : null,
    'Moved Qty (MT)': r.lifted_qty as number,
    'Billed (₹, with GST)': r.billed as number,
    'Lift By': r.lift_by_date as string | null,
    'Status': r.status as string,
  }));
}

function billsRows(from: string, to: string): Row[] {
  return all(
    `SELECT i.invoice_no, i.kind, p.name party, b.booking_no, i.invoice_date, i.qty_mt, i.rate_inr_mt,
            i.base_amount, i.gst_amount, i.total_amount, i.due_date, IFNULL(pay.paid, 0) paid
     FROM invoices i JOIN parties p ON p.id = i.party_id
     LEFT JOIN bookings b ON b.id = i.booking_id
     LEFT JOIN (SELECT invoice_id, SUM(amount) paid FROM payments GROUP BY invoice_id) pay ON pay.invoice_id = i.id
     WHERE i.invoice_date BETWEEN ? AND ?
     ORDER BY i.invoice_date`, from, to,
  ).map((r) => ({
    'Bill No': r.invoice_no as string,
    'Type': r.kind === 'PURCHASE' ? 'Supplier bill (we pay)' : 'Customer bill (we receive)',
    'Party': r.party as string,
    'Booking': r.booking_no as string | null,
    'Date': r.invoice_date as string,
    'Quantity (MT)': r.qty_mt as number,
    'Rate (₹/MT)': r.rate_inr_mt as number,
    'Amount (₹)': r.base_amount as number,
    'GST (₹)': r.gst_amount as number,
    'Total (₹)': r.total_amount as number,
    'Paid (₹)': r.paid as number,
    'Pending (₹)': Math.max(0, (r.total_amount as number) - (r.paid as number)),
    'Due Date': r.due_date as string,
  }));
}

function paymentsRows(from: string, to: string): Row[] {
  return all(
    `SELECT pm.payment_date, pm.direction, p.name party, i.invoice_no, pm.amount, pm.mode, pm.utr_no, pm.bank
     FROM payments pm JOIN parties p ON p.id = pm.party_id
     LEFT JOIN invoices i ON i.id = pm.invoice_id
     WHERE pm.payment_date BETWEEN ? AND ?
     ORDER BY pm.payment_date`, from, to,
  ).map((r) => ({
    'Date': r.payment_date as string,
    'Direction': r.direction === 'IN' ? 'Received' : 'Paid',
    'Party': r.party as string,
    'Against Bill': r.invoice_no as string | null,
    'Amount (₹)': r.amount as number,
    'Mode': r.mode as string,
    'UTR / Reference': r.utr_no as string | null,
    'Bank': r.bank as string | null,
  }));
}

function trucksRows(from: string, to: string): Row[] {
  return all(
    `SELECT l.dispatch_date, l.truck_no, l.transporter, b.booking_no, b.kind, p.name party, l.qty_mt,
            l.eway_bill_no, l.challan_no, l.dispatch_weight_kg, l.received_weight_kg,
            l.arrived_date, l.unloaded_date, l.unloaded_by, l.status
     FROM liftings l JOIN bookings b ON b.id = l.booking_id JOIN parties p ON p.id = b.party_id
     WHERE l.dispatch_date BETWEEN ? AND ?
     ORDER BY l.dispatch_date`, from, to,
  ).map((r) => ({
    'Dispatch Date': r.dispatch_date as string,
    'Truck': r.truck_no as string,
    'Transporter': r.transporter as string | null,
    'Booking': r.booking_no as string,
    'Direction': r.kind === 'PURCHASE' ? 'Incoming' : 'Outgoing',
    'Party': r.party as string,
    'Quantity (MT)': r.qty_mt as number,
    'E-way Bill': r.eway_bill_no as string | null,
    'Challan': r.challan_no as string | null,
    'Sent Weight (kg)': r.dispatch_weight_kg as number | null,
    'Received Weight (kg)': r.received_weight_kg as number | null,
    'Shortage (kg)': r.received_weight_kg != null ? +((r.dispatch_weight_kg as number) - (r.received_weight_kg as number)).toFixed(1) : null,
    'Arrived': r.arrived_date as string | null,
    'Unloaded': r.unloaded_date as string | null,
    'Unloaded By': r.unloaded_by as string | null,
    'Status': TRUCK_LABEL[r.status as string] ?? (r.status as string),
  }));
}

function profitRows(from: string, to: string): Row[] {
  return all(
    `SELECT s.booking_no sale_no, pb.booking_no purchase_no, cp.name customer, sp.name supplier,
            s.booking_date, MIN(IFNULL(sf.q,0), s.qty_mt) qty, sf.rate sale_rate, pf.rate buy_rate
     FROM bookings s
     JOIN bookings pb ON pb.id = s.linked_booking_id
     JOIN parties cp ON cp.id = s.party_id
     JOIN parties sp ON sp.id = pb.party_id
     JOIN (SELECT booking_id, SUM(qty_mt) q, SUM(qty_mt*price_inr_mt)/SUM(qty_mt) rate FROM price_fixations GROUP BY booking_id) sf ON sf.booking_id = s.id
     JOIN (SELECT booking_id, SUM(qty_mt) q, SUM(qty_mt*price_inr_mt)/SUM(qty_mt) rate FROM price_fixations GROUP BY booking_id) pf ON pf.booking_id = pb.id
     WHERE s.kind = 'SALE' AND s.booking_date BETWEEN ? AND ?
     ORDER BY s.booking_date`, from, to,
  ).map((r) => ({
    'Sale Booking': r.sale_no as string,
    'Purchase Booking': r.purchase_no as string,
    'Customer': r.customer as string,
    'Supplier': r.supplier as string,
    'Date': r.booking_date as string,
    'Quantity (MT)': +(r.qty as number).toFixed(1),
    'Sold At (₹/MT)': Math.round(r.sale_rate as number),
    'Bought At (₹/MT)': Math.round(r.buy_rate as number),
    'Margin (₹/MT)': Math.round((r.sale_rate as number) - (r.buy_rate as number)),
    'Margin Total (₹)': Math.round(((r.sale_rate as number) - (r.buy_rate as number)) * (r.qty as number)),
  }));
}

function ledgerRows(partyId: number, from: string, to: string): Row[] {
  let balance = 0;
  return all(
    `SELECT * FROM (
       SELECT i.invoice_date entry_date, 'Bill' type, i.invoice_no ref, i.total_amount debit, NULL credit,
              ROUND(i.qty_mt,1) || ' MT @ ' || CAST(ROUND(i.rate_inr_mt) AS INTEGER) detail
       FROM invoices i WHERE i.party_id = ?1
       UNION ALL
       SELECT pm.payment_date, 'Payment', IFNULL(pm.utr_no, pm.mode), NULL, pm.amount,
              pm.mode || IFNULL(' / ' || pm.bank, '')
       FROM payments pm WHERE pm.party_id = ?1
     ) WHERE entry_date BETWEEN ?2 AND ?3 ORDER BY entry_date, type`, partyId, from, to,
  ).map((r) => {
    balance += ((r.debit as number) ?? 0) - ((r.credit as number) ?? 0);
    return {
      'Date': r.entry_date as string,
      'Entry': r.type as string,
      'Reference': r.ref as string,
      'Details': r.detail as string,
      'Bill Amount (₹)': r.debit as number | null,
      'Paid (₹)': r.credit as number | null,
      'Running Balance (₹)': Math.round(balance),
    };
  });
}

function sheet(wb: XLSX.WorkBook, name: string, rows: Row[]) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No entries in this period' }]);
  const headers = rows.length ? Object.keys(rows[0]) : ['Note'];
  ws['!cols'] = headers.map((h) => ({
    wch: Math.min(34, Math.max(h.length + 2, ...rows.slice(0, 200).map((r) => String(r[h] ?? '').length + 2))),
  }));
  XLSX.utils.book_append_sheet(wb, ws, name);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = sp.get('type') ?? 'all';
  const from = sp.get('from') || '2000-01-01';
  const to = sp.get('to') || '2999-12-31';

  const wb = XLSX.utils.book_new();
  let filename = `copperbook-${type}-${from}-to-${to}.xlsx`;

  if (type === 'bookings') sheet(wb, 'Bookings', bookingsRows(from, to));
  else if (type === 'bills') sheet(wb, 'Bills', billsRows(from, to));
  else if (type === 'payments') sheet(wb, 'Payments', paymentsRows(from, to));
  else if (type === 'trucks') sheet(wb, 'Trucks', trucksRows(from, to));
  else if (type === 'profit') sheet(wb, 'Profit', profitRows(from, to));
  else if (type === 'ledger') {
    const partyId = Number(sp.get('party'));
    const p = get<{ name: string }>(`SELECT name FROM parties WHERE id = ?`, partyId);
    if (!p) return new Response('Unknown party', { status: 400 });
    sheet(wb, 'Account', ledgerRows(partyId, from, to));
    filename = `copperbook-account-${p.name.replace(/[^\w]+/g, '-')}-${from}-to-${to}.xlsx`;
  } else {
    sheet(wb, 'Bookings', bookingsRows(from, to));
    sheet(wb, 'Bills', billsRows(from, to));
    sheet(wb, 'Payments', paymentsRows(from, to));
    sheet(wb, 'Trucks', trucksRows(from, to));
    sheet(wb, 'Profit', profitRows(from, to));
    filename = `copperbook-all-reports-${from}-to-${to}.xlsx`;
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
