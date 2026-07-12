// Demo data generator, shared by `npm run seed` (CLI) and first-boot seeding.
// seedDemo() fills an already-open, schema-applied database; clearAllData()
// empties every table. Both operate on the passed connection only.
import type { DatabaseSync } from 'node:sqlite';

const TABLES = ['payments', 'invoices', 'liftings', 'price_fixations', 'bookings', 'csp_prices', 'parties'];

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
}
