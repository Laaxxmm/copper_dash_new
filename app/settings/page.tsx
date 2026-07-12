import { PageHead } from '@/components/ui';
import { CopperIngots } from '@/components/CopperArt';
import EraseForm from '@/components/EraseForm';
import { logout } from '@/lib/auth-actions';
import { reloadDemoData } from '@/lib/settings-actions';
import { ADMIN_USER } from '@/lib/auth';
import { all } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ done?: string; err?: string }> }) {
  const { done, err } = await searchParams;
  const counts = Object.fromEntries(
    ['parties', 'bookings', 'liftings', 'invoices', 'payments'].map((t) => [
      t, (all(`SELECT COUNT(*) c FROM ${t}`)[0] as { c: number }).c,
    ]),
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHead title="Settings" sub="Your account, and the data in this register. Handle the erase option with care — it cannot be undone." />

      {done === 'erased' ? <div className="notice good">All data erased. The register is now empty and ready for your real entries.</div> : null}
      {done === 'demo' ? <div className="notice good">Demo data reloaded.</div> : null}
      {err === 'confirm' ? <div className="notice bad">Type ERASE exactly to confirm — nothing was deleted.</div> : null}

      <div className="grid two-col section-gap" style={{ alignItems: 'start' }}>
        <div className="grid" style={{ gap: 14 }}>
          <div className="card card-pad">
            <div className="card-title">Account</div>
            <p style={{ fontSize: 14.5, color: 'var(--ink-2)' }}>
              Signed in as <b>{ADMIN_USER}</b>. To change the username or password, set
              {' '}<span className="mono-sm">ADMIN_USER</span> and <span className="mono-sm">ADMIN_PASSWORD</span> in
              your hosting environment variables, then sign in again.
            </p>
            <form action={logout} style={{ marginTop: 14 }}>
              <button type="submit" className="btn-order outline">Sign out</button>
            </form>
          </div>

          <div className="card card-pad">
            <div className="card-title">What&apos;s in the register now</div>
            <div className="count-row">
              {Object.entries(counts).map(([k, v]) => (
                <div key={k} className="count-cell">
                  <div className="count-num">{v}</div>
                  <div className="count-lbl">{k}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card card-pad danger-card">
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <CopperIngots className="settings-ingots" />
            <div>
              <div className="card-title">Data</div>
              <p style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 4 }}>
                The register currently holds <b>{total.toLocaleString('en-IN')}</b> records, including the built-in demo data.
              </p>
            </div>
          </div>

          <div className="settings-block">
            <div className="settings-block-head">Reload demo data</div>
            <p className="settings-block-note">Clear everything and restore the sample suppliers, customers and six months of trade — handy while trying things out.</p>
            <form action={reloadDemoData}>
              <button type="submit" className="btn-order outline">Reload demo data</button>
            </form>
          </div>

          <div className="settings-block danger">
            <div className="settings-block-head" style={{ color: 'var(--bad)' }}>Erase all data</div>
            <p className="settings-block-note">
              Permanently delete <b>everything</b> — demo data and any real entries — leaving a clean, empty register.
              Do this once, before you start entering your own bookings. <b>This cannot be undone.</b>
            </p>
            <EraseForm />
          </div>
        </div>
      </div>

      <div className="help">
        <b>Recommended first step on a new setup:</b> look around with the demo data, then come here and <b>Erase all data</b> to
        start your real register clean. Back up the database file (the volume) before erasing if you want to keep the demo.
      </div>
    </>
  );
}
