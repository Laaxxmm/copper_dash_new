'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from './db';
import { clearAllData, seedDemo } from './seed';

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
