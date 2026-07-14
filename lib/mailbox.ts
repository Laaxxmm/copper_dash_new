// Gmail/IMAP fetch worker. Credential-gated and fully isolated: imapflow +
// mailparser load via dynamic import ONLY when a poll runs, so app boot and the
// build never touch them. Reads unseen mail, runs the same parseDoc + matchers
// as the paste path, and stages PI/PO/CANCEL docs in the review queue — never
// posts on its own. No app password configured → it no-ops with a message.
//
// ponytail: needs the user's real Gmail app password to verify end-to-end;
// cannot be exercised in this environment. The parse/match/stage half is the
// same code the capture tests already cover.
import { get, run } from './db';
import { today } from './format';
import { parseDoc, matchSupplier, detectProductId, matchAllocation } from './capture';

const cfg = (k: string) => get<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, k)?.value ?? '';

export type PollResult = { ok: boolean; message: string; captured: number };

export async function pollMailbox(): Promise<PollResult> {
  const address = cfg('mail:address');
  const password = cfg('mail:app_password');
  const host = cfg('mail:imap_host') || 'imap.gmail.com';
  if (!address || !password) return { ok: false, message: 'Add a Gmail address and app password in Settings first.', captured: 0 };

  let client: { connect: () => Promise<void>; getMailboxLock: (m: string) => Promise<{ release: () => void }>; search: (q: object, o?: object) => Promise<number[] | false>; fetch: (r: unknown, q: object, o?: object) => AsyncIterable<{ uid: number; source: Buffer }>; messageFlagsAdd: (r: unknown, f: string[], o?: object) => Promise<boolean>; logout: () => Promise<void> } | null = null;
  try {
    const { ImapFlow } = await import('imapflow');
    const { simpleParser } = await import('mailparser');
    // @ts-expect-error runtime shape matches the minimal interface above
    client = new ImapFlow({ host, port: 993, secure: true, auth: { user: address, pass: password }, logger: false });
    await client!.connect();
    const lock = await client!.getMailboxLock('INBOX');
    let captured = 0;
    try {
      const uids = await client!.search({ seen: false }, { uid: true });
      if (uids && uids.length) {
        for await (const msg of client!.fetch(uids, { source: true }, { uid: true })) {
          const mail = await simpleParser(msg.source);
          const text = `${mail.subject ?? ''}\n${mail.from?.text ?? ''}\n${mail.text ?? (typeof mail.html === 'string' ? mail.html.replace(/<[^>]+>/g, ' ') : '')}`;
          const doc = parseDoc(text);
          if (doc.doc_type === 'UNKNOWN') continue; // leave unrelated mail untouched
          const sup = matchSupplier(text);
          const productId = detectProductId(text);
          const alloc = matchAllocation(doc, text);
          run(
            `INSERT INTO email_captures (received_at, doc_type, reference_no, matched_allocation_id, matched_requirement_id,
               matched_supplier_id, matched_product_id, extracted_json, status, raw_ref)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            today(), doc.doc_type, doc.reference_no, alloc?.allocation_id ?? null, alloc?.requirement_id ?? null,
            sup?.supplier_id ?? null, productId, JSON.stringify(doc), doc.mismatch ? 'MISMATCH' : 'PENDING', text.slice(0, 4000));
          await client!.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
          captured++;
        }
      }
    } finally {
      lock.release();
    }
    await client!.logout();
    return { ok: true, message: captured ? `Pulled ${captured} new document${captured > 1 ? 's' : ''} into the review queue.` : 'No new PI/PO emails.', captured };
  } catch (e) {
    try { await client?.logout(); } catch { /* ignore */ }
    return { ok: false, message: `Mailbox error: ${(e as Error).message}. Check the address, app password and host.`, captured: 0 };
  }
}
