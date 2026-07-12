// CopperBook seed — deterministic realistic data for a mid-size copper trader.
// Run: npm run seed   (rebuilds data/copper.db from scratch)
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dbDir = join(root, 'data');
const dbPath = join(dbDir, 'copper.db');
mkdirSync(dbDir, { recursive: true });
for (const suffix of ['', '-wal', '-shm']) {
  if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix);
}

const db = new DatabaseSync(dbPath);
// Apply schema statement-by-statement (SQL only, no shell involved).
const schemaSql = readFileSync(join(root, 'db', 'schema.sql'), 'utf8');
for (const raw of schemaSql.split(';')) {
  const stmt = raw.replace(/--[^\n]*/g, '').trim();
  if (!stmt) continue;
  if (stmt.toUpperCase().startsWith('PRAGMA')) db.prepare(stmt).get();
  else db.prepare(stmt).run();
}

// ---------- deterministic RNG ----------
let rngState = 20260711;
function rand() {
  rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + rand() * (b - a);
const round = (x, p = 0) => Math.round(x * 10 ** p) / 10 ** p;

// ---------- date helpers (anchor: today) ----------
const TODAY = new Date().toISOString().slice(0, 10);
const d = (iso) => new Date(iso + 'T00:00:00Z');
const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (isoStr, n) => { const x = d(isoStr); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
const START = addDays(TODAY, -180);

// ---------- parties ----------
const suppliers = [
  ['Hindalco (Birla Copper)', 'Dahej, Gujarat', 'Rakesh Shah', '98250 11223', '24AAACH1201R1Z5', 0, 'Producer. Advance payment before lifting.'],
  ['Vedanta Sterlite Copper', 'Silvassa', 'M. Krishnan', '98790 44556', '26AAACS7101P1Z3', 0, 'Producer. Advance / LC.'],
  ['Kutch Copper (Adani)', 'Mundra, Gujarat', 'Jignesh Patel', '99090 77889', '24AAKCK9021Q1Z8', 7, 'New producer, ramping up.'],
  ['Mehta Metals', 'Mumbai', 'Paresh Mehta', '98200 33445', '27AABCM4412E1Z9', 15, 'Trader. Imported cathode.'],
  ['Shree Balaji Copper', 'Delhi', 'Sanjay Gupta', '98110 66778', '07AAECS8812K1Z2', 10, 'Trader. Scrap + cathode.'],
];
const customers = [
  ['Sri Venkateswara Wires', 'Hyderabad', 'K. Ramesh', '98490 12321', '36AAACS4501B1Z6', 45, 'Winding wire maker.'],
  ['Elite Winding Wires', 'Coimbatore', 'S. Palanisamy', '98430 45654', '33AABCE7723M1Z1', 60, 'Winding wire maker.'],
  ['Jai Bharat Cables', 'Rajkot', 'Bhavesh Joshi', '98240 78987', '24AACCJ3345H1Z4', 30, 'Cable maker.'],
  ['Annapurna Alloys', 'Jamnagar', 'Dinesh Thakkar', '99250 32123', '24AAFCA9910C1Z7', 45, 'Brass parts maker.'],
  ['Kaveri Conductors', 'Salem', 'V. Murugan', '94430 65456', '33AAJCK2278L1Z0', 60, 'Conductor maker.'],
  ['Lotus Electricals', 'Pune', 'Amit Kulkarni', '98220 98789', '27AALCL5567F1Z3', 30, 'Motor rewinding shop.'],
];
const insParty = db.prepare(
  `INSERT INTO parties (name,type,city,contact_person,phone,gstin,credit_days,notes)
   VALUES (?,?,?,?,?,?,?,?)`);
const supplierIds = suppliers.map(s => Number(insParty.run(s[0], 'SUPPLIER', ...s.slice(1)).lastInsertRowid));
const customerIds = customers.map(c => Number(insParty.run(c[0], 'CUSTOMER', ...c.slice(1)).lastInsertRowid));
const creditDaysById = {};
[...suppliers.entries()].forEach(([i, s]) => creditDaysById[supplierIds[i]] = s[5]);
[...customers.entries()].forEach(([i, c]) => creditDaysById[customerIds[i]] = c[5]);

// ---------- daily CSP price series (INR/MT), gentle random walk ----------
const insCsp = db.prepare('INSERT INTO csp_prices (price_date, price_inr_mt) VALUES (?,?)');
const csp = {};
let price = 872000; // ~₹872/kg six months ago
for (let day = START; day <= TODAY; day = addDays(day, 1)) {
  const drift = 380;                       // slow uptrend
  const shock = between(-5200, 5200);
  price = Math.max(820000, price + drift + shock);
  csp[day] = round(price / 100) * 100;
  insCsp.run(day, csp[day]);
}
const cspOn = (day) => { let x = day; while (!csp[x]) x = addDays(x, -1); return csp[x]; };
const cspAvg = (from, to) => {
  let s = 0, n = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) { if (csp[day]) { s += csp[day]; n++; } }
  return n ? round(s / n / 100) * 100 : cspOn(to);
};

// ---------- statements ----------
const insBooking = db.prepare(
  `INSERT INTO bookings (booking_no,kind,party_id,booking_date,qty_mt,pricing_basis,premium_inr_mt,
     avg_start,avg_end,lift_by_date,status,linked_booking_id,notes)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insFix = db.prepare(
  `INSERT INTO price_fixations (booking_id,fixation_date,qty_mt,price_inr_mt,reference,note)
   VALUES (?,?,?,?,?,?)`);
const insLift = db.prepare(
  `INSERT INTO liftings (booking_id,dispatch_date,qty_mt,truck_no,transporter,driver_phone,eway_bill_no,
     challan_no,dispatch_weight_kg,received_weight_kg,arrived_date,unloaded_date,unloaded_by,status,note)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insInvoice = db.prepare(
  `INSERT INTO invoices (invoice_no,kind,party_id,booking_id,lifting_id,invoice_date,qty_mt,rate_inr_mt,
     base_amount,gst_amount,total_amount,due_date)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
const insPayment = db.prepare(
  `INSERT INTO payments (direction,party_id,invoice_id,payment_date,amount,mode,utr_no,bank,note)
   VALUES (?,?,?,?,?,?,?,?,?)`);

const transporters = ['VRL Logistics', 'Sharma Roadways', 'Patel Transport Co', 'TCI Freight', 'Om Sai Cargo'];
const unloaders = ['Ganesh (godown)', 'Ravi & team', 'Shift B crew', 'Suresh (godown)'];
const banks = ['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank'];
const truckNo = () => `${pick(['GJ', 'MH', 'TN', 'DL', 'RJ'])}-${String(Math.floor(between(1, 39))).padStart(2, '0')}-${pick(['AB', 'CD', 'XY', 'KL', 'MN'])}-${Math.floor(between(1000, 9999))}`;
const utr = () => `${pick(['HDFCR5', 'ICICR2', 'SBINR9', 'UTIBR4'])}${Math.floor(between(10 ** 9, 9 * 10 ** 9))}`;

let pbSeq = 0, sbSeq = 0, invSeq = { PURCHASE: 0, SALE: 0 }, ewaySeq = 381100200100;

// premium the trader pays suppliers over CSP; margin it charges customers
const supplierPremium = { [supplierIds[0]]: 4200, [supplierIds[1]]: 3800, [supplierIds[2]]: 2600, [supplierIds[3]]: 1800, [supplierIds[4]]: 1200 };

function makeBooking({ kind, partyId, day, qty, basis, premium, linkedId = null }) {
  const no = kind === 'PURCHASE' ? `PB-${String(++pbSeq).padStart(3, '0')}` : `SB-${String(++sbSeq).padStart(3, '0')}`;
  let avgStart = null, avgEnd = null;
  if (basis === 'MONTH_AVG') { const m = day.slice(0, 7); avgStart = `${m}-01`; avgEnd = iso(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0))); }
  if (basis === 'FORTNIGHT_AVG') { const m = day.slice(0, 7); const dd = +day.slice(8, 10); avgStart = dd <= 15 ? `${m}-01` : `${m}-16`; avgEnd = dd <= 15 ? `${m}-15` : iso(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0))); }
  if (basis === 'WEEK_AVG') { avgStart = addDays(day, -6); avgEnd = day; }
  const liftBy = addDays(day, Math.floor(between(20, 60)));
  const id = Number(insBooking.run(no, kind, partyId, day, qty, basis, premium, avgStart, avgEnd, liftBy, 'OPEN', linkedId, null).lastInsertRowid);
  return { id, no, kind, partyId, day, qty, basis, premium, avgStart, avgEnd };
}

function fixPrice(b, day, qty, note = null) {
  let ref = 'CSP', base;
  if (b.basis === 'FIXED') { ref = 'NEGOTIATED'; base = cspOn(b.day) + between(-3000, 3000); }
  else if (b.basis === 'DAY_PRICE') base = cspOn(b.day);
  else if (b.basis === 'PRICE_LATER') base = cspOn(day);
  else base = cspAvg(b.avgStart, b.avgEnd <= TODAY ? b.avgEnd : TODAY);
  const rate = round((base + b.premium) / 100) * 100;
  insFix.run(b.id, day, qty, rate, ref, note);
  return rate;
}

function addLifting(b, day, qty, opts = {}) {
  const dispatchKg = round(qty * 1000 + between(-8, 8), 1);
  const transitDays = Math.floor(between(1, 5));
  const arrived = addDays(day, transitDays);
  let status = 'IN_TRANSIT', arrivedDate = null, unloadedDate = null, unloadedBy = null, receivedKg = null;
  if (arrived <= TODAY && !opts.forceTransit) {
    status = 'ARRIVED'; arrivedDate = arrived;
    const unload = addDays(arrived, rand() < 0.85 ? 0 : 1);
    if (unload <= TODAY && !opts.forceArrived) {
      status = 'UNLOADED'; unloadedDate = unload; unloadedBy = pick(unloaders);
      const shortage = rand() < 0.16 ? between(15, 90) : between(0, 6);
      receivedKg = round(dispatchKg - shortage, 1);
    }
  }
  const id = Number(insLift.run(
    b.id, day, qty, truckNo(), pick(transporters), `9${Math.floor(between(10 ** 8, 9 * 10 ** 8))}`,
    `EWB${ewaySeq++}`, `CH-${b.no}-${Math.floor(between(10, 99))}`,
    dispatchKg, receivedKg, arrivedDate, unloadedDate, unloadedBy, status, null,
  ).lastInsertRowid);
  return { id, day, qty, status };
}

function addInvoice(b, lift, rate) {
  const no = b.kind === 'PURCHASE'
    ? `${['HIN', 'VED', 'KUT', 'MEH', 'SBC'][supplierIds.indexOf(b.partyId)] ?? 'SUP'}/${String(++invSeq.PURCHASE).padStart(4, '0')}`
    : `CB/26-27/${String(++invSeq.SALE).padStart(4, '0')}`;
  const invDate = lift.day;
  const base = round(lift.qty * rate);
  const gst = round(base * 0.18);
  const total = base + gst;
  const due = addDays(invDate, creditDaysById[b.partyId]);
  const id = Number(insInvoice.run(no, b.kind, b.partyId, b.id, lift.id, invDate, lift.qty, rate, base, gst, total, due).lastInsertRowid);
  return { id, total, invDate, due, partyId: b.partyId, kind: b.kind };
}

function payInvoice(inv, fraction, day) {
  if (day > TODAY) return;
  const amount = round(inv.total * fraction);
  const mode = inv.total > 500000 ? pick(['RTGS', 'RTGS', 'RTGS', 'NEFT']) : pick(['NEFT', 'IMPS', 'UPI', 'CHEQUE']);
  insPayment.run(inv.kind === 'PURCHASE' ? 'OUT' : 'IN', inv.partyId, inv.id, day, amount, mode,
    ['RTGS', 'NEFT', 'IMPS'].includes(mode) ? utr() : null, pick(banks), null);
}

// ---------- generate 6 months of trade ----------
const basisPool = ['DAY_PRICE', 'DAY_PRICE', 'MONTH_AVG', 'FORTNIGHT_AVG', 'WEEK_AVG', 'FIXED', 'PRICE_LATER'];

// Purchase bookings: 30 over 180 days
const purchases = [];
for (let i = 0; i < 30; i++) {
  const day = addDays(START, Math.floor((i / 30) * 172 + between(0, 5)));
  const supplierId = pick(supplierIds);
  const qty = pick([3, 4, 5, 6, 9, 10, 12, 15, 18, 25]);
  const basis = pick(basisPool);
  const b = makeBooking({ kind: 'PURCHASE', partyId: supplierId, day, qty, basis, premium: supplierPremium[supplierId] + Math.round(between(-200, 200)) });
  purchases.push(b);
}

// Sale bookings: 36, most linked back-to-back to a purchase around the same time
const sales = [];
for (let i = 0; i < 36; i++) {
  const day = addDays(START, Math.floor((i / 36) * 174 + between(0, 5)));
  const customerId = pick(customerIds);
  const qty = pick([1, 2, 2, 3, 3, 4, 5, 6, 8]);
  const basis = pick(['DAY_PRICE', 'DAY_PRICE', 'MONTH_AVG', 'WEEK_AVG', 'FIXED', 'PRICE_LATER']);
  const nearPurchase = purchases.filter(p => Math.abs(d(p.day) - d(day)) < 20 * 86400000);
  const linked = nearPurchase.length && rand() < 0.7 ? pick(nearPurchase) : null;
  // Sale premium = supplier premium + trader margin ₹2.5k-7k/MT
  const marginOver = Math.round(between(2500, 7000) / 100) * 100;
  const b = makeBooking({ kind: 'SALE', partyId: customerId, day, qty, basis, premium: (linked ? linked.premium : 3500) + marginOver, linkedId: linked?.id ?? null });
  sales.push(b);
}

// Progress each booking through fixation → lifting → invoice → payment
for (const b of [...purchases, ...sales]) {
  const age = Math.floor((d(TODAY) - d(b.day)) / 86400000);
  // How much of the booking has been lifted so far?
  let liftPlan;
  if (age > 45) liftPlan = [b.qty];                                     // fully lifted, maybe in 2 lots
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

    // price fixation: PRICE_LATER fixes after lifting (sometimes not yet = exposure)
    let rate;
    const fixedLate = b.basis === 'PRICE_LATER' && (rand() < 0.35 || addDays(liftDay, 12) > TODAY);
    if (fixedLate) {
      rate = round((cspOn(liftDay) + b.premium) / 100) * 100;  // provisional rate for invoice
    } else {
      const fixDay = b.basis === 'PRICE_LATER' ? addDays(liftDay, Math.floor(between(3, 12))) : liftDay;
      rate = fixPrice(b, fixDay <= TODAY ? fixDay : liftDay, lotQty, b.basis === 'PRICE_LATER' ? 'Fixed after lifting' : null);
    }

    const inv = addInvoice(b, lift, rate);
    // Payment behaviour: producers paid in advance/immediately; customers per credit, some late/partial
    if (b.kind === 'PURCHASE') {
      const payDay = creditDaysById[b.partyId] === 0 ? addDays(inv.invDate, -1) : addDays(inv.due, Math.floor(between(-3, 4)));
      payInvoice(inv, 1, payDay);
    } else {
      const r = rand();
      if (r < 0.55) payInvoice(inv, 1, addDays(inv.due, Math.floor(between(-6, 5))));       // pays on time-ish
      else if (r < 0.75) { payInvoice(inv, 0.5, addDays(inv.invDate, Math.floor(between(5, 20)))); payInvoice(inv, 0.5, addDays(inv.due, Math.floor(between(3, 25)))); }
      else if (r < 0.88) payInvoice(inv, 0.6, addDays(inv.due, Math.floor(between(-2, 10)))); // part payment, rest pending
      // else: nothing paid yet
    }
  }

  // Bookings fully lifted & priced & old → COMPLETED
  const fullyLifted = liftedSoFar >= b.qty - 0.01;
  if (fullyLifted && addDays(lastLiftDay, 15) < TODAY && rand() < 0.9) {
    db.prepare(`UPDATE bookings SET status='COMPLETED' WHERE id=?`).run(b.id);
  }
}

// A couple of trucks currently on the road / waiting to unload (for the Today page)
for (const [k, b] of [...purchases.slice(-3), ...sales.slice(-2)].entries()) {
  const remaining = round(b.qty * 0.5, 1);
  if (remaining > 0.5) {
    const daysAgo = k % 2 === 0 ? Math.floor(between(1, 3)) : Math.floor(between(6, 8));
    const lift = addLifting(b, addDays(TODAY, -daysAgo), remaining, k % 2 === 0 ? { forceTransit: true } : { forceArrived: true });
    const rate = round((cspOn(lift.day) + b.premium) / 100) * 100;
    const inv = addInvoice(b, lift, rate);
    if (b.kind === 'PURCHASE' && creditDaysById[b.partyId] === 0) payInvoice(inv, 1, addDays(lift.day, -1));
  }
}

// One cancelled booking for realism
db.prepare(`UPDATE bookings SET status='CANCELLED', notes='Customer backed out, qty not lifted' WHERE booking_no='SB-004'`).run();

const counts = {};
for (const t of ['parties', 'csp_prices', 'bookings', 'price_fixations', 'liftings', 'invoices', 'payments']) {
  counts[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
}
console.log('Seeded', dbPath);
console.table(counts);
db.close();
