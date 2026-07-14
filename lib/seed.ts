// Demo data generator, shared by `npm run seed` (CLI) and first-boot seeding.
// seedDemo() fills an already-open, schema-applied database; clearAllData()
// empties every table. Both operate on the passed connection only.
import type { DatabaseSync } from 'node:sqlite';

// Cleared on "erase all"; children first for FK safety. The `products` catalog
// (wire/rod reference data) is intentionally NOT cleared.
const TABLES = ['sales_pi', 'sale_products', 'price_lines', 'price_templates', 'expenses',
  'purchase_orders', 'supplier_targets', 'email_captures', 'allocations', 'requirements',
  'payments', 'invoices', 'liftings', 'price_fixations',
  'supplier_terms', 'bookings', 'fx_rates', 'lme_prices', 'csp_prices', 'parties'];

/** Remove every row (children first for FK safety) and reset id counters. */
export function clearAllData(db: DatabaseSync) {
  db.prepare('PRAGMA foreign_keys = OFF').run();
  for (const t of TABLES) db.prepare(`DELETE FROM ${t}`).run();
  const hasSeq = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'`).get();
  if (hasSeq) db.prepare(`DELETE FROM sqlite_sequence`).run();
  db.prepare('PRAGMA foreign_keys = ON').run();
}

export function isEmpty(db: DatabaseSync): boolean {
  const row = db.prepare(`SELECT COUNT(*) c FROM parties`).get() as { c: number };
  return row.c === 0;
}

/** Six months of deterministic, realistic trade anchored to today. */
export function seedDemo(db: DatabaseSync) {
  // ---------- deterministic RNG ----------
  let rngState = 20260711;
  const rand = () => {
    rngState |= 0; rngState = (rngState + 0x6d2b79f5) | 0;
    let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const between = (a: number, b: number) => a + rand() * (b - a);
  const round = (x: number, p = 0) => Math.round(x * 10 ** p) / 10 ** p;

  // ---------- date helpers (anchor: today) ----------
  const TODAY = new Date().toISOString().slice(0, 10);
  const d = (i: string) => new Date(i + 'T00:00:00Z');
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const addDays = (s: string, n: number) => { const x = d(s); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
  const START = addDays(TODAY, -180);

  // ---------- parties ----------
  const suppliers = [
    ['Hindalco (Birla Copper)', 'Dahej, Gujarat', 'Rakesh Shah', '98250 11223', '24AAACH1201R1Z5', 0, 'Producer. Advance payment before lifting.'],
    ['Vedanta Sterlite Copper', 'Silvassa', 'M. Krishnan', '98790 44556', '26AAACS7101P1Z3', 0, 'Producer. Advance / LC.'],
    ['Kutch Copper (Adani)', 'Mundra, Gujarat', 'Jignesh Patel', '99090 77889', '24AAKCK9021Q1Z8', 7, 'New producer, ramping up.'],
    ['Mehta Metals', 'Mumbai', 'Paresh Mehta', '98200 33445', '27AABCM4412E1Z9', 15, 'Trader. Imported cathode.'],
    ['Shree Balaji Copper', 'Delhi', 'Sanjay Gupta', '98110 66778', '07AAECS8812K1Z2', 10, 'Trader. Scrap + cathode.'],
  ] as const;
  const customers = [
    ['Sri Venkateswara Wires', 'Hyderabad', 'K. Ramesh', '98490 12321', '36AAACS4501B1Z6', 45, 'Winding wire maker.'],
    ['Elite Winding Wires', 'Coimbatore', 'S. Palanisamy', '98430 45654', '33AABCE7723M1Z1', 60, 'Winding wire maker.'],
    ['Jai Bharat Cables', 'Rajkot', 'Bhavesh Joshi', '98240 78987', '24AACCJ3345H1Z4', 30, 'Cable maker.'],
    ['Annapurna Alloys', 'Jamnagar', 'Dinesh Thakkar', '99250 32123', '24AAFCA9910C1Z7', 45, 'Brass parts maker.'],
    ['Kaveri Conductors', 'Salem', 'V. Murugan', '94430 65456', '33AAJCK2278L1Z0', 60, 'Conductor maker.'],
    ['Lotus Electricals', 'Pune', 'Amit Kulkarni', '98220 98789', '27AALCL5567F1Z3', 30, 'Motor rewinding shop.'],
  ] as const;

  const insParty = db.prepare(
    `INSERT INTO parties (name,type,city,contact_person,phone,gstin,credit_days,notes) VALUES (?,?,?,?,?,?,?,?)`);
  const supplierIds = suppliers.map((s) => Number(insParty.run(s[0], 'SUPPLIER', s[1], s[2], s[3], s[4], s[5], s[6]).lastInsertRowid));
  const customerIds = customers.map((c) => Number(insParty.run(c[0], 'CUSTOMER', c[1], c[2], c[3], c[4], c[5], c[6]).lastInsertRowid));
  const creditDaysById: Record<number, number> = {};
  suppliers.forEach((s, i) => (creditDaysById[supplierIds[i]] = s[5]));
  customers.forEach((c, i) => (creditDaysById[customerIds[i]] = c[5]));

  // ---------- Phase 1: exchange basis, supplier terms, LME + FX series ----------
  // [premium USD/MT, factor %, handling INR/MT, transaction USD/MT, delivery days, credit days, TT basis]
  const supTerms: [number, number, number, number, number, number, string][] = [
    [180, 3.75, 6200, 10, 4, 0, 'RBI_TT'],   // Hindalco
    [200, 3.75, 6100, 10, 3, 0, 'RBI_TT'],   // Vedanta
    [210, 5.5, 5900, 10, 5, 7, 'SBI_TT'],    // Kutch
    [260, 5.5, 6000, 10, 6, 15, 'SBI_TT'],   // Mehta
    [150, 5.5, 6100, 10, 3, 10, 'RBI_TT'],   // Shree Balaji
  ];
  const upBasis = db.prepare(`UPDATE parties SET exchange_basis = ? WHERE id = ?`);
  supplierIds.forEach((id, i) => upBasis.run(supTerms[i][6], id));
  customerIds.forEach((id, i) => upBasis.run(i % 2 ? 'SBI_TT' : 'RBI_TT', id));
  db.prepare(`UPDATE parties SET email = 'sales@' || lower(substr(name,1,instr(name||' ',' ')-1)) || '.com'`).run();

  const prodRows = db.prepare(`SELECT id, type, size_mm FROM products`).all() as { id: number; type: string; size_mm: number }[];
  const insTerm = db.prepare(
    `INSERT OR IGNORE INTO supplier_terms
       (supplier_id, product_id, premium_usd_mt, transaction_usd_mt, factor_pct, handling_inr_mt, delivery_days, credit_days)
     VALUES (?,?,?,?,?,?,?,?)`);
  supplierIds.forEach((sid, i) => {
    const [prem, fac, hand, txn, del, cr] = supTerms[i];
    for (const p of prodRows) {
      const adj = p.type === 'WIRE' ? Math.round((6 - p.size_mm) * 18) : -25; // finer wire = higher premium
      insTerm.run(sid, p.id, (prem as number) + adj, txn, fac, hand, del, cr);
    }
  });

  const insLme = db.prepare(`INSERT OR IGNORE INTO lme_prices (price_date, usd_mt, source) VALUES (?,?, 'manual')`);
  const insFx = db.prepare(`INSERT OR IGNORE INTO fx_rates (rate_date, basis, usd_inr) VALUES (?,?,?)`);
  let lme = 13250, rbi = 89.1; // near current LME copper levels (~$13,400/MT)
  for (let day = addDays(TODAY, -75); day <= TODAY; day = addDays(day, 1)) {
    const dow = new Date(day + 'T00:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) continue; // LME trades weekdays only
    lme = Math.max(12500, lme + 4 + between(-70, 90));
    insLme.run(day, Math.round(lme));
    rbi = Math.max(85, rbi + between(-0.08, 0.09));
    insFx.run(day, 'RBI_TT', Math.round(rbi * 100) / 100);
    insFx.run(day, 'SBI_TT', Math.round((rbi - 0.14) * 100) / 100);
  }

  // ---------- daily CSP price series (INR/MT) ----------
  const insCsp = db.prepare('INSERT INTO csp_prices (price_date, price_inr_mt) VALUES (?,?)');
  const csp: Record<string, number> = {};
  let price = 872000;
  for (let day = START; day <= TODAY; day = addDays(day, 1)) {
    price = Math.max(820000, price + 380 + between(-5200, 5200));
    csp[day] = round(price / 100) * 100;
    insCsp.run(day, csp[day]);
  }
  const cspOn = (day: string): number => { let x = day; while (!csp[x]) x = addDays(x, -1); return csp[x]; };
  const cspAvg = (from: string, to: string) => {
    let s = 0, n = 0;
    for (let day = from; day <= to; day = addDays(day, 1)) if (csp[day]) { s += csp[day]; n++; }
    return n ? round(s / n / 100) * 100 : cspOn(to);
  };

  // ---------- prepared statements ----------
  const insBooking = db.prepare(
    `INSERT INTO bookings (booking_no,kind,party_id,booking_date,qty_mt,pricing_basis,premium_inr_mt,
       avg_start,avg_end,lift_by_date,status,linked_booking_id,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insFix = db.prepare(
    `INSERT INTO price_fixations (booking_id,fixation_date,qty_mt,price_inr_mt,reference,note) VALUES (?,?,?,?,?,?)`);
  const insLift = db.prepare(
    `INSERT INTO liftings (booking_id,dispatch_date,qty_mt,truck_no,transporter,driver_phone,eway_bill_no,
       challan_no,dispatch_weight_kg,received_weight_kg,arrived_date,unloaded_date,unloaded_by,status,note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insInvoice = db.prepare(
    `INSERT INTO invoices (invoice_no,kind,party_id,booking_id,lifting_id,invoice_date,qty_mt,rate_inr_mt,
       base_amount,gst_amount,total_amount,due_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insPayment = db.prepare(
    `INSERT INTO payments (direction,party_id,invoice_id,payment_date,amount,mode,utr_no,bank,note) VALUES (?,?,?,?,?,?,?,?,?)`);

  const transporters = ['VRL Logistics', 'Sharma Roadways', 'Patel Transport Co', 'TCI Freight', 'Om Sai Cargo'];
  const unloaders = ['Ganesh (godown)', 'Ravi & team', 'Shift B crew', 'Suresh (godown)'];
  const banks = ['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank'];
  const truckNo = () => `${pick(['GJ', 'MH', 'TN', 'DL', 'RJ'])}-${String(Math.floor(between(1, 39))).padStart(2, '0')}-${pick(['AB', 'CD', 'XY', 'KL', 'MN'])}-${Math.floor(between(1000, 9999))}`;
  const utr = () => `${pick(['HDFCR5', 'ICICR2', 'SBINR9', 'UTIBR4'])}${Math.floor(between(1e9, 9e9))}`;

  let pbSeq = 0, sbSeq = 0;
  const invSeq = { PURCHASE: 0, SALE: 0 };
  let ewaySeq = 381100200100;
  const supplierPremium: Record<number, number> = {
    [supplierIds[0]]: 4200, [supplierIds[1]]: 3800, [supplierIds[2]]: 2600, [supplierIds[3]]: 1800, [supplierIds[4]]: 1200,
  };

  type Booking = { id: number; no: string; kind: string; partyId: number; day: string; qty: number; basis: string; premium: number; avgStart: string | null; avgEnd: string | null };

  const makeBooking = (o: { kind: string; partyId: number; day: string; qty: number; basis: string; premium: number; linkedId?: number | null }): Booking => {
    const no = o.kind === 'PURCHASE' ? `PB-${String(++pbSeq).padStart(3, '0')}` : `SB-${String(++sbSeq).padStart(3, '0')}`;
    let avgStart: string | null = null, avgEnd: string | null = null;
    if (o.basis === 'MONTH_AVG') { const m = o.day.slice(0, 7); avgStart = `${m}-01`; avgEnd = iso(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0))); }
    if (o.basis === 'FORTNIGHT_AVG') { const m = o.day.slice(0, 7); const dd = +o.day.slice(8, 10); avgStart = dd <= 15 ? `${m}-01` : `${m}-16`; avgEnd = dd <= 15 ? `${m}-15` : iso(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0))); }
    if (o.basis === 'WEEK_AVG') { avgStart = addDays(o.day, -6); avgEnd = o.day; }
    const liftBy = addDays(o.day, Math.floor(between(20, 60)));
    const id = Number(insBooking.run(no, o.kind, o.partyId, o.day, o.qty, o.basis, o.premium, avgStart, avgEnd, liftBy, 'OPEN', o.linkedId ?? null, null).lastInsertRowid);
    return { id, no, kind: o.kind, partyId: o.partyId, day: o.day, qty: o.qty, basis: o.basis, premium: o.premium, avgStart, avgEnd };
  };

  const fixPrice = (b: Booking, day: string, qty: number, note: string | null = null) => {
    let ref = 'CSP', base: number;
    if (b.basis === 'FIXED') { ref = 'NEGOTIATED'; base = cspOn(b.day) + between(-3000, 3000); }
    else if (b.basis === 'DAY_PRICE') base = cspOn(b.day);
    else if (b.basis === 'PRICE_LATER') base = cspOn(day);
    else base = cspAvg(b.avgStart!, b.avgEnd! <= TODAY ? b.avgEnd! : TODAY);
    const rate = round((base + b.premium) / 100) * 100;
    insFix.run(b.id, day, qty, rate, ref, note);
    return rate;
  };

  const addLifting = (b: Booking, day: string, qty: number, opts: { forceTransit?: boolean; forceArrived?: boolean } = {}) => {
    const dispatchKg = round(qty * 1000 + between(-8, 8), 1);
    const arrived = addDays(day, Math.floor(between(1, 5)));
    let status = 'IN_TRANSIT', arrivedDate: string | null = null, unloadedDate: string | null = null, unloadedBy: string | null = null, receivedKg: number | null = null;
    if (arrived <= TODAY && !opts.forceTransit) {
      status = 'ARRIVED'; arrivedDate = arrived;
      const unload = addDays(arrived, rand() < 0.85 ? 0 : 1);
      if (unload <= TODAY && !opts.forceArrived) {
        status = 'UNLOADED'; unloadedDate = unload; unloadedBy = pick(unloaders);
        receivedKg = round(dispatchKg - (rand() < 0.16 ? between(15, 90) : between(0, 6)), 1);
      }
    }
    const id = Number(insLift.run(
      b.id, day, qty, truckNo(), pick(transporters), `9${Math.floor(between(1e8, 9e8))}`,
      `EWB${ewaySeq++}`, `CH-${b.no}-${Math.floor(between(10, 99))}`,
      dispatchKg, receivedKg, arrivedDate, unloadedDate, unloadedBy, status, null).lastInsertRowid);
    return { id, day, qty, status };
  };

  const addInvoice = (b: Booking, lift: { id: number; day: string; qty: number }, rate: number) => {
    const no = b.kind === 'PURCHASE'
      ? `${(['HIN', 'VED', 'KUT', 'MEH', 'SBC'][supplierIds.indexOf(b.partyId)] ?? 'SUP')}/${String(++invSeq.PURCHASE).padStart(4, '0')}`
      : `CB/26-27/${String(++invSeq.SALE).padStart(4, '0')}`;
    const base = round(lift.qty * rate), gst = round(base * 0.18), total = base + gst;
    const due = addDays(lift.day, creditDaysById[b.partyId]);
    const id = Number(insInvoice.run(no, b.kind, b.partyId, b.id, lift.id, lift.day, lift.qty, rate, base, gst, total, due).lastInsertRowid);
    return { id, total, invDate: lift.day, due, partyId: b.partyId, kind: b.kind };
  };

  const payInvoice = (inv: { total: number; partyId: number; kind: string; id: number }, fraction: number, day: string) => {
    if (day > TODAY) return;
    const amount = round(inv.total * fraction);
    const mode = inv.total > 500000 ? pick(['RTGS', 'RTGS', 'RTGS', 'NEFT']) : pick(['NEFT', 'IMPS', 'UPI', 'CHEQUE']);
    insPayment.run(inv.kind === 'PURCHASE' ? 'OUT' : 'IN', inv.partyId, inv.id, day, amount, mode,
      ['RTGS', 'NEFT', 'IMPS'].includes(mode) ? utr() : null, pick(banks), null);
  };

  // ---------- generate ----------
  const basisPool = ['DAY_PRICE', 'DAY_PRICE', 'MONTH_AVG', 'FORTNIGHT_AVG', 'WEEK_AVG', 'FIXED', 'PRICE_LATER'];
  const purchases: Booking[] = [];
  for (let i = 0; i < 30; i++) {
    const day = addDays(START, Math.floor((i / 30) * 172 + between(0, 5)));
    const supplierId = pick(supplierIds);
    purchases.push(makeBooking({
      kind: 'PURCHASE', partyId: supplierId, day, qty: pick([3, 4, 5, 6, 9, 10, 12, 15, 18, 25]),
      basis: pick(basisPool), premium: supplierPremium[supplierId] + Math.round(between(-200, 200)),
    }));
  }
  const sales: Booking[] = [];
  for (let i = 0; i < 36; i++) {
    const day = addDays(START, Math.floor((i / 36) * 174 + between(0, 5)));
    const nearPurchase = purchases.filter((p) => Math.abs(+d(p.day) - +d(day)) < 20 * 86400000);
    const linked = nearPurchase.length && rand() < 0.7 ? pick(nearPurchase) : null;
    const marginOver = Math.round(between(2500, 7000) / 100) * 100;
    sales.push(makeBooking({
      kind: 'SALE', partyId: pick(customerIds), day, qty: pick([1, 2, 2, 3, 3, 4, 5, 6, 8]),
      basis: pick(['DAY_PRICE', 'DAY_PRICE', 'MONTH_AVG', 'WEEK_AVG', 'FIXED', 'PRICE_LATER']),
      premium: (linked ? linked.premium : 3500) + marginOver, linkedId: linked?.id ?? null,
    }));
  }

  for (const b of [...purchases, ...sales]) {
    const age = Math.floor((+d(TODAY) - +d(b.day)) / 86400000);
    let liftPlan: number[];
    if (age > 45) liftPlan = [b.qty];
    else if (age > 20) liftPlan = rand() < 0.5 ? [b.qty] : [round(b.qty * 0.5, 1), round(b.qty * 0.5, 1)];
    else if (age > 7) liftPlan = rand() < 0.5 ? [round(b.qty * 0.5, 1)] : [b.qty];
    else liftPlan = rand() < 0.5 ? [] : [round(b.qty * 0.5, 1)];
    if (age > 45 && b.qty >= 9 && rand() < 0.5) liftPlan = [round(b.qty * 0.4, 1), round(b.qty * 0.6, 1)];

    let liftedSoFar = 0, lastLiftDay = b.day;
    for (const [j, lotQty] of liftPlan.entries()) {
      if (lotQty <= 0) continue;
      const liftDay = addDays(b.day, Math.floor(between(2 + j * 12, 10 + j * 14)));
      if (liftDay > TODAY) break;
      const lift = addLifting(b, liftDay, lotQty);
      liftedSoFar += lotQty; lastLiftDay = liftDay;

      let rate: number;
      const fixedLate = b.basis === 'PRICE_LATER' && (rand() < 0.35 || addDays(liftDay, 12) > TODAY);
      if (fixedLate) {
        rate = round((cspOn(liftDay) + b.premium) / 100) * 100;
      } else {
        const fixDay = b.basis === 'PRICE_LATER' ? addDays(liftDay, Math.floor(between(3, 12))) : liftDay;
        rate = fixPrice(b, fixDay <= TODAY ? fixDay : liftDay, lotQty, b.basis === 'PRICE_LATER' ? 'Fixed after lifting' : null);
      }

      const inv = addInvoice(b, lift, rate);
      if (b.kind === 'PURCHASE') {
        const payDay = creditDaysById[b.partyId] === 0 ? addDays(inv.invDate, -1) : addDays(inv.due, Math.floor(between(-3, 4)));
        payInvoice(inv, 1, payDay);
      } else {
        const r = rand();
        if (r < 0.55) payInvoice(inv, 1, addDays(inv.due, Math.floor(between(-6, 5))));
        else if (r < 0.75) { payInvoice(inv, 0.5, addDays(inv.invDate, Math.floor(between(5, 20)))); payInvoice(inv, 0.5, addDays(inv.due, Math.floor(between(3, 25)))); }
        else if (r < 0.88) payInvoice(inv, 0.6, addDays(inv.due, Math.floor(between(-2, 10))));
      }
    }

    if (liftedSoFar >= b.qty - 0.01 && addDays(lastLiftDay, 15) < TODAY && rand() < 0.9) {
      db.prepare(`UPDATE bookings SET status='COMPLETED' WHERE id=?`).run(b.id);
    }
  }

  // A few trucks currently moving / waiting to unload (for the Today page)
  [...purchases.slice(-3), ...sales.slice(-2)].forEach((b, k) => {
    const remaining = round(b.qty * 0.5, 1);
    if (remaining <= 0.5) return;
    const daysAgo = k % 2 === 0 ? Math.floor(between(1, 3)) : Math.floor(between(6, 8));
    const lift = addLifting(b, addDays(TODAY, -daysAgo), remaining, k % 2 === 0 ? { forceTransit: true } : { forceArrived: true });
    const rate = round((cspOn(lift.day) + b.premium) / 100) * 100;
    const inv = addInvoice(b, lift, rate);
    if (b.kind === 'PURCHASE' && creditDaysById[b.partyId] === 0) payInvoice(inv, 1, addDays(lift.day, -1));
  });

  db.prepare(`UPDATE bookings SET status='CANCELLED', notes='Customer backed out, qty not lifted' WHERE booking_no='SB-004'`).run();

  // Phase 1: attach a product + the USD pricing components to purchase bookings
  // (default grade 1.60 mm wire), pulled from each supplier's terms.
  const defProd = db.prepare(`SELECT id FROM products WHERE type='WIRE' AND size_mm=1.6`).get() as { id: number } | undefined;
  if (defProd) {
    const pid = defProd.id;
    db.prepare(
      `UPDATE bookings SET
         product_id = ?,
         premium_usd_mt = IFNULL((SELECT premium_usd_mt FROM supplier_terms st WHERE st.supplier_id = bookings.party_id AND st.product_id = ?), 0),
         transaction_usd_mt = IFNULL((SELECT transaction_usd_mt FROM supplier_terms st WHERE st.supplier_id = bookings.party_id AND st.product_id = ?), 0),
         factor_pct = IFNULL((SELECT factor_pct FROM supplier_terms st WHERE st.supplier_id = bookings.party_id AND st.product_id = ?), 0),
         handling_inr_mt = IFNULL((SELECT handling_inr_mt FROM supplier_terms st WHERE st.supplier_id = bookings.party_id AND st.product_id = ?), 0)
       WHERE kind = 'PURCHASE'`).run(pid, pid, pid, pid, pid);
  }

  // ---------- Phase 2 demo: requirements split across suppliers ----------
  const ym = TODAY.slice(0, 7).replace('-', '');
  const prodBy = (type: string, size: number) =>
    (db.prepare(`SELECT id FROM products WHERE type=? AND size_mm=?`).get(type, size) as { id: number }).id;
  const termOf = (sid: number, pid: number) =>
    (db.prepare(`SELECT premium_usd_mt,factor_pct,handling_inr_mt,transaction_usd_mt FROM supplier_terms WHERE supplier_id=? AND product_id=?`).get(sid, pid) as
      { premium_usd_mt: number; factor_pct: number; handling_inr_mt: number; transaction_usd_mt: number } | undefined)
      ?? { premium_usd_mt: 220, factor_pct: 5, handling_inr_mt: 6000, transaction_usd_mt: 10 };
  const insPB = db.prepare(
    `INSERT INTO bookings (booking_no,kind,party_id,booking_date,qty_mt,pricing_basis,premium_inr_mt,avg_start,avg_end,
       lift_by_date,status,linked_booking_id,notes,premium_usd_mt,transaction_usd_mt,factor_pct,handling_inr_mt,product_id)
     VALUES (?,'PURCHASE',?,?,?,'PRICE_LATER',0,NULL,NULL,NULL,'OPEN',NULL,?,?,?,?,?,?)`);
  const insReq = db.prepare(
    `INSERT INTO requirements (req_no,customer_id,product_id,qty_mt,need_by_date,target_sell_inr_kg,status,created_date,notes)
     VALUES (?,?,?,?,?,?,?,?,?)`);
  const insAlloc = db.prepare(
    `INSERT INTO allocations (requirement_id,supplier_id,tier_label,qty_mt,rate_inr_kg,booking_id,status,created_date,notes)
     VALUES (?,?,?,?,?,?,?,?,?)`);
  const rateOf = (t: { premium_usd_mt: number; factor_pct: number; handling_inr_mt: number; transaction_usd_mt: number }) =>
    Math.round(((lme + t.premium_usd_mt + t.transaction_usd_mt) * (1 + t.factor_pct / 100) * (rbi / 1000) + t.handling_inr_mt / 1000) * 100) / 100;
  const makeAlloc = (reqId: number, sid: number, pid: number, qty: number, tier: string, booked: boolean) => {
    const t = termOf(sid, pid);
    const rate = rateOf(t);
    const no = `PB-${String(++pbSeq).padStart(3, '0')}`;
    const bid = Number(insPB.run(no, sid, TODAY, qty, 'From requirement', t.premium_usd_mt, t.transaction_usd_mt, t.factor_pct, t.handling_inr_mt, pid).lastInsertRowid);
    if (booked) insFix.run(bid, TODAY, qty, Math.round(rate * 1000), 'CSP', null);
    insAlloc.run(reqId, sid, tier, qty, rate, bid, booked ? 'RECEIVED' : 'PI_RECEIVED', TODAY, null);
  };
  const sellTarget = () => Math.round((rateOf(termOf(supplierIds[0], prodBy('WIRE', 1.6))) + 9) * 10) / 10;

  const w160 = prodBy('WIRE', 1.6), rod8 = prodBy('ROD', 8), w575 = prodBy('WIRE', 5.75);
  // A — filled 25 MT, split 5 / 10 / 10 (last leg still provisional)
  const ra = Number(insReq.run(`REQ-${ym}-001`, customerIds[1], w160, 25, addDays(TODAY, 10), sellTarget(), 'OPEN', TODAY, null).lastInsertRowid);
  makeAlloc(ra, supplierIds[0], w160, 5, 'L1', true);
  makeAlloc(ra, supplierIds[1], w160, 10, 'L2', true);
  makeAlloc(ra, supplierIds[2], w160, 10, 'L3', false);
  db.prepare(`UPDATE requirements SET status='FILLED' WHERE id=?`).run(ra);
  // B — partly sourced 12 MT rod, 5 taken
  const rb = Number(insReq.run(`REQ-${ym}-002`, customerIds[3], rod8, 12, addDays(TODAY, 14), Math.round((rateOf(termOf(supplierIds[4], rod8)) + 8) * 10) / 10, 'OPEN', TODAY, null).lastInsertRowid);
  makeAlloc(rb, supplierIds[4], rod8, 5, 'L1', false);
  db.prepare(`UPDATE requirements SET status='PARTIAL' WHERE id=?`).run(rb);
  // C — 8 MT with one enquiry sent (no booking yet), 4 MT still to source
  const rc = Number(insReq.run(`REQ-${ym}-003`, customerIds[0], w575, 8, addDays(TODAY, 20), sellTarget(), 'OPEN', TODAY, null).lastInsertRowid);
  db.prepare(
    `INSERT INTO allocations (requirement_id,supplier_id,tier_label,qty_mt,rate_inr_kg,booking_id,status,created_date,sent_at,notes)
     VALUES (?,?,?,?,?,NULL,'ENQUIRY',?,?,NULL)`).run(rc, supplierIds[0], 'L1', 4, rateOf(termOf(supplierIds[0], w575)), TODAY, TODAY);
  db.prepare(`UPDATE requirements SET status='PARTIAL' WHERE id=?`).run(rc);

  // ---------- Revamp demo: monthly per-supplier, per-product targets + manual L-rank ----------
  const curMonth = TODAY.slice(0, 7);
  const insTarget = db.prepare(
    `INSERT OR IGNORE INTO supplier_targets (supplier_id, product_id, month, target_mt, agreed_mt) VALUES (?,?,?,?,?)`);
  const targets: [number, number, number, number][] = [
    [0, w160, 30, 28], [0, rod8, 10, 10],
    [1, w160, 20, 18],
    [2, w160, 15, 12], [2, w575, 8, 6],
    [3, w160, 12, 12],
    [4, rod8, 15, 10],
  ];
  for (const [si, pid, tgt, agr] of targets) insTarget.run(supplierIds[si], pid, curMonth, tgt, agr);
  const upRank = db.prepare(`UPDATE parties SET manual_rank = ? WHERE id = ?`);
  supplierIds.forEach((id, i) => upRank.run(i + 1, id));

  // ---------- Revamp demo: a few purchase orders (committed cost of purchase) ----------
  const insPO = db.prepare(
    `INSERT INTO purchase_orders (po_no, supplier_id, product_id, month, qty_mt, rate_inr_kg,
       base_amount, tax_amount, gross_amount, lme_usd, fx_rate, basis, status, created_date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  let poSeq = 0;
  const makePO = (sid: number, pid: number, qty: number, status = 'SENT') => {
    const rate = rateOf(termOf(sid, pid));
    const base = round(rate * qty * 1000 * 100) / 100;
    const tax = round(base * 0.18 * 100) / 100;
    insPO.run(`PO-${String(++poSeq).padStart(3, '0')}`, sid, pid, curMonth, qty, rate, base, tax,
      round((base + tax) * 100) / 100, round(lme), rbi, 'DAY', status, TODAY);
  };
  makePO(supplierIds[0], w160, 20); makePO(supplierIds[0], rod8, 8);
  makePO(supplierIds[2], w160, 12); makePO(supplierIds[3], w160, 10);
  makePO(supplierIds[4], rod8, 8, 'CANCELLED');

  // ---------- Sales demo: reusable pricing templates + customer products ----------
  const insTpl = db.prepare(`INSERT INTO price_templates (name, notes, created_date) VALUES (?,?,?)`);
  const insLine = db.prepare(`INSERT INTO price_lines (template_id, seq, label, kind, operator, value) VALUES (?,?,?,?,?,?)`);
  const tpl = (name: string, notes: string, lines: [string, string, string, number][]) => {
    const id = Number(insTpl.run(name, notes, TODAY).lastInsertRowid);
    lines.forEach((l, i) => insLine.run(id, i, l[0], l[1], l[2], l[3]));
    return id;
  };
  const tplFine = tpl('Fine wire — standard markup', 'Drawn wire: fabrication + wastage + margin',
    [['Copper cost', 'BUY_COST', 'ADD', 0], ['Fabrication', 'FABRICATION', 'ADD', 0], ['Wastage', 'PERCENT', 'ADD', 2], ['Margin', 'FIXED', 'ADD', 9]]);
  const tplResale = tpl('Direct resale', 'Buy price + flat margin',
    [['Copper cost', 'BUY_COST', 'ADD', 0], ['Margin', 'FIXED', 'ADD', 6]]);
  const insSP = db.prepare(`INSERT INTO sale_products (customer_id, name, raw_product_id, template_id, fabrication_cost, notes, active, created_date) VALUES (?,?,?,?,?,?,1,?)`);
  insSP.run(customerIds[1], '2.5mm drawn wire', prodBy('WIRE', 2.5), tplFine, 18, null, TODAY);
  insSP.run(customerIds[0], '8mm rod (resale)', rod8, tplResale, 0, null, TODAY);
  insSP.run(customerIds[3], '1.6mm winding wire', w160, tplFine, 15, null, TODAY);
}
