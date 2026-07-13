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
