'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { run } from './db';
import { today } from './format';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const num = (fd: FormData, k: string) => Number(fd.get(k) ?? 0);

export async function addExpense(fd: FormData) {
  const month = str(fd, 'month') || today().slice(0, 7);
  const category = str(fd, 'category') || 'Other';
  const amount = Math.max(0, num(fd, 'amount'));
  if (!(amount > 0)) redirect('/finance?err=' + encodeURIComponent('Enter an amount.'));
  run(`INSERT INTO expenses (month, category, amount, notes, created_date) VALUES (?,?,?,?,?)`,
    month, category, amount, str(fd, 'notes') || null, today());
  revalidatePath('/', 'layout');
  redirect(`/finance?month=${month}`);
}

export async function deleteExpense(fd: FormData) {
  run(`DELETE FROM expenses WHERE id = ?`, num(fd, 'expense_id'));
  revalidatePath('/', 'layout');
  redirect('/finance');
}
