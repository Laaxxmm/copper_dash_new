import { PageHead } from '@/components/ui';
import { CopperIngots } from '@/components/CopperArt';
import EraseForm from '@/components/EraseForm';
import { logout } from '@/lib/auth-actions';
import { reloadDemoData, saveMailMap, saveGmail, saveCompany } from '@/lib/settings-actions';
import { ADMIN_USER } from '@/lib/auth';
import { getSetting, companyProfile } from '@/lib/company';
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
  const suppliers = all<{ id: number; name: string; email: string | null; mail_keywords: string | null }>(
    `SELECT id, name, email, mail_keywords FROM parties WHERE type='SUPPLIER' ORDER BY (manual_rank IS NULL), manual_rank, name`);
  const gmail = { address: getSetting('mail:address'), host: getSetting('mail:imap_host', 'imap.gmail.com'), poll: getSetting('mail:poll_min', '10'), hasPw: !!getSetting('mail:app_password') };
  const co = companyProfile();
  const COMPANY_FIELDS: [string, keyof typeof co][] = [
    ['Company name', 'name'], ['Address', 'address'], ['City / PIN', 'city'], ['State', 'state'],
    ['State code', 'state_code'], ['GSTIN', 'gstin'], ['PAN', 'pan'], ['CIN', 'cin'],
    ['Bank', 'bank'], ['Branch', 'branch'], ['IFSC', 'ifsc'], ['Account no.', 'account'],
  ];

  return (
    <>
      <PageHead title="Settings" sub="Your account, and the data in this register. Handle the erase option with care — it cannot be undone." />

      {done === 'erased' ? <div className="notice good">All data erased. The register is now empty and ready for your real entries.</div> : null}
      {done === 'demo' ? <div className="notice good">Demo data reloaded.</div> : null}
      {err === 'confirm' ? <div className="notice bad">Type ERASE exactly to confirm — nothing was deleted.</div> : null}
      {done === 'mailmap' ? <div className="notice good">Mailbox map saved.</div> : null}
      {done === 'gmail' ? <div className="notice good">Gmail connection saved. Live pull activates once the fetch worker is enabled.</div> : null}
      {done === 'company' ? <div className="notice good">Company profile saved — it heads every PO.</div> : null}
      {err === 'logo' ? <div className="notice bad">Logo must be an image under 250 KB.</div> : null}

      <form action={saveCompany} className="card card-pad section-gap">
        <div className="card-title">Company profile — the buyer on every PO</div>
        <div className="company-logo-row">
          {co.logo ? <img src={co.logo} alt="logo" className="brand-logo" style={{ maxHeight: 40 }} /> : <span className="muted">No logo yet</span>}
          <label className="fr-field" style={{ flex: 1 }}>Upload logo (PNG/SVG, ≤ 250 KB) — shown in the sidebar
            <input name="logo" type="file" accept="image/*" />
          </label>
        </div>
        <div className="form-grid" style={{ marginTop: 12 }}>
          {COMPANY_FIELDS.map(([label, key]) => (
            <label key={key}>{label}<input name={key} type="text" defaultValue={co[key]} /></label>
          ))}
        </div>
        <button type="submit" className="btn btn-sm">Save company profile</button>
      </form>

      <form action={saveGmail} className="card card-pad section-gap">
        <div className="card-title">Mailbox — connect Gmail (auto-pull PI / PO)</div>
        <p style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 12 }}>
          Use a Gmail <b>app password</b> (not your login password). Incoming PIs/POs are parsed and staged in the Inbox for you to confirm — never posted automatically. {gmail.hasPw ? '✓ An app password is saved.' : 'No app password saved yet.'}
        </p>
        <div className="form-grid">
          <label>Gmail address<input name="address" type="email" defaultValue={gmail.address} placeholder="purchase@yourfirm.com" /></label>
          <label>App password<input name="app_password" type="password" placeholder={gmail.hasPw ? '•••••••• (saved)' : '16-char app password'} /></label>
          <label>IMAP host<input name="imap_host" type="text" defaultValue={gmail.host} /></label>
          <label>Check every (minutes)<input name="poll_min" type="number" min="1" defaultValue={gmail.poll} /></label>
        </div>
        <button type="submit" className="btn btn-sm">Save Gmail connection</button>
      </form>

      <form action={saveMailMap} className="card card-pad section-gap">
        <div className="card-title">Mailbox map — which supplier is which sender</div>
        <p style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 12 }}>
          Set each supplier&apos;s sender <b>email</b> (the domain routes their mail) and any <b>keywords</b> (comma-separated) that appear in their PIs. The Inbox uses these to match incoming documents.
        </p>
        <div className="table-wrap">
          <table className="data compact">
            <thead><tr><th>Supplier</th><th>Sender email</th><th>Keywords</th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}<input type="hidden" name="sid" value={s.id} /></td>
                  <td><input name={`email_${s.id}`} type="email" defaultValue={s.email ?? ''} placeholder="sales@supplier.com" style={{ width: '100%', padding: '7px 8px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff' }} /></td>
                  <td><input name={`kw_${s.id}`} type="text" defaultValue={s.mail_keywords ?? ''} placeholder="e.g. savli, metrod" style={{ width: '100%', padding: '7px 8px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="submit" className="btn btn-sm" style={{ marginTop: 12 }}>Save mailbox map</button>
      </form>

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
