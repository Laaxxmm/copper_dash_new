'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb, run } from './db';
import { clearAllData, seedDemo } from './seed';

/** Appearance: accent colour, density, and whether the collections banner shows.
 *  Persisted in settings and applied app-wide via data-attributes on <html>. */
export async function saveAppearance(fd: FormData) {
  const accent = ['copper', 'green', 'blue', 'plum'].includes(String(fd.get('accent'))) ? String(fd.get('accent')) : 'copper';
  const density = String(fd.get('density')) === 'compact' ? 'compact' : 'comfortable';
  const banner = fd.get('banner') === 'on' ? 'on' : 'off';
  for (const [k, v] of [['ui:accent', accent], ['ui:density', density], ['ui:banner', banner]] as [string, string][]) {
    run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, k, v);
  }
  revalidatePath('/', 'layout');
  redirect('/settings?done=appearance');
}

/** Company (PO buyer) profile + optional logo upload (stored as a data URI). */
export async function saveCompany(fd: FormData) {
  const keys = ['name', 'address', 'city', 'state', 'state_code', 'gstin', 'pan', 'cin', 'bank', 'branch', 'ifsc', 'account'];
  for (const k of keys) run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, `company:${k}`, String(fd.get(k) ?? '').trim());
  const logo = fd.get('logo');
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > 250_000 || !logo.type.startsWith('image/')) redirect('/settings?err=logo');
    const dataUri = `data:${logo.type};base64,${Buffer.from(await logo.arrayBuffer()).toString('base64')}`;
    run(`INSERT INTO settings (key, value) VALUES ('company:logo', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, dataUri);
  }
  revalidatePath('/', 'layout');
  redirect('/settings?done=company');
}

/** Mailbox → supplier map: each supplier's sender email domain + keywords, used to
 *  auto-route incoming PI/PO. Saved per supplier from the Settings form. */
export async function saveMailMap(fd: FormData) {
  const ids = fd.getAll('sid').map(Number);
  for (const sid of ids) {
    run(`UPDATE parties SET email = ?, mail_keywords = ? WHERE id = ?`,
      String(fd.get(`email_${sid}`) ?? '').trim() || null,
      String(fd.get(`kw_${sid}`) ?? '').trim() || null, sid);
  }
  revalidatePath('/', 'layout');
  redirect('/settings?done=mailmap');
}

/** Gmail/IMAP connection settings for auto-pulling PI/PO. Stored server-side; the
 *  live fetch worker (Phase F) reads these once a real app password is entered. */
export async function saveGmail(fd: FormData) {
  const kv: [string, string][] = [
    ['mail:address', String(fd.get('address') ?? '').trim()],
    ['mail:app_password', String(fd.get('app_password') ?? '').trim()],
    ['mail:imap_host', String(fd.get('imap_host') ?? '').trim() || 'imap.gmail.com'],
    ['mail:poll_min', String(fd.get('poll_min') ?? '').trim() || '10'],
  ];
  for (const [k, v] of kv) run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, k, v);
  revalidatePath('/', 'layout');
  redirect('/settings?done=gmail');
}

/** Wipe every record — bookings, trucks, bills, payments, people, prices. */
export async function eraseAllData(formData: FormData) {
  if (String(formData.get('confirm') ?? '') !== 'ERASE') {
    redirect('/settings?err=confirm');
  }
  clearAllData(getDb());
  revalidatePath('/', 'layout');
  redirect('/settings?done=erased');
}

/** Reset back to the built-in demo data (clears first, then re-seeds). */
export async function reloadDemoData() {
  const db = getDb();
  clearAllData(db);
  seedDemo(db);
  revalidatePath('/', 'layout');
  redirect('/settings?done=demo');
}
