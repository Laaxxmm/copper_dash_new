'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb, run } from './db';
import { clearAllData, seedDemo } from './seed';
import { OPTIONAL_MODULES } from './modules';

/** Turn optional menu modules on/off. */
export async function saveModules(fd: FormData) {
  for (const m of OPTIONAL_MODULES) {
    run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      `module:${m.key}`, fd.get(`m_${m.key}`) === 'on' ? 'on' : 'off');
  }
  revalidatePath('/', 'layout');
  redirect('/settings?done=modules');
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
