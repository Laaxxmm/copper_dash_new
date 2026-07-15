import { readFileSync, existsSync } from 'node:fs';
import { requireSuperAdmin } from '@/lib/current-user';
import { clientById } from '@/lib/control-db';
import { runWithTenant } from '@/lib/tenant';
import { getDb } from '@/lib/db';
import { today } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Download a client's business DB as a backup (super-admin only). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const c = clientById(Number((await params).id));
  if (!c || !c.db_path || !existsSync(c.db_path)) return new Response('Not found', { status: 404 });

  // Fold the WAL back into the .db file so the download is a complete snapshot.
  runWithTenant({ clientId: c.id, dbPath: c.db_path }, () => {
    try { getDb().prepare('PRAGMA wal_checkpoint(TRUNCATE)').get(); } catch { /* best effort */ }
  });

  const buf = readFileSync(c.db_path);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${c.slug || 'client'}-${today()}.db"`,
      'Content-Length': String(buf.length),
    },
  });
}
