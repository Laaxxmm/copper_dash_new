'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { get, run } from './db';
import { today } from './format';
import { matchAllocation, parseDoc, type ParsedDoc } from './capture';
import { bookEnquiry, cancelAlloc } from './req-core';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const num = (fd: FormData, k: string) => Number(fd.get(k) ?? 0);
const refresh = () => revalidatePath('/', 'layout');

/** Paste a PI/PO email → parse, match to an open enquiry, stage for review. Never posts. */
export async function captureEmail(fd: FormData) {
  const rawText = str(fd, 'text');
  if (rawText.length < 15) redirect('/inbox?err=' + encodeURIComponent('Paste the PI or PO email text first.'));
  const parsed = parseDoc(rawText);
  const match = matchAllocation(parsed, rawText);
  run(
    `INSERT INTO email_captures (received_at, doc_type, reference_no, matched_allocation_id, matched_requirement_id, extracted_json, status, raw_ref)
     VALUES (?,?,?,?,?,?,?,?)`,
    today(), parsed.doc_type, parsed.reference_no, match?.allocation_id ?? null, match?.requirement_id ?? null,
    JSON.stringify(parsed), parsed.mismatch ? 'MISMATCH' : 'PENDING', rawText);
  refresh();
  redirect('/inbox');
}

/** Human confirms a staged capture → apply it (book the enquiry, or cancel on a CANCEL doc). */
export async function confirmCapture(fd: FormData) {
  const id = num(fd, 'capture_id');
  const c = get<{ doc_type: string; status: string; matched_allocation_id: number | null; reference_no: string | null; extracted_json: string }>(
    `SELECT doc_type, status, matched_allocation_id, reference_no, extracted_json FROM email_captures WHERE id = ?`, id);
  if (!c || (c.status !== 'PENDING' && c.status !== 'MISMATCH')) redirect('/inbox');
  if (!c!.matched_allocation_id) redirect('/inbox?err=' + encodeURIComponent('No matching enquiry — reject it, or send the enquiry first.'));

  if (c!.doc_type === 'CANCEL') {
    cancelAlloc(c!.matched_allocation_id);
  } else {
    const parsed = JSON.parse(c!.extracted_json) as ParsedDoc;
    const rate = num(fd, 'rate') > 0 ? num(fd, 'rate') : parsed.computed_rate_inr_kg ?? undefined;
    bookEnquiry(c!.matched_allocation_id, { rate, note: `PI ${c!.reference_no ?? '—'}` });
  }
  run(`UPDATE email_captures SET status = 'CONFIRMED' WHERE id = ?`, id);
  refresh();
  redirect('/inbox');
}

export async function rejectCapture(fd: FormData) {
  run(`UPDATE email_captures SET status = 'REJECTED' WHERE id = ?`, num(fd, 'capture_id'));
  refresh();
  redirect('/inbox');
}
