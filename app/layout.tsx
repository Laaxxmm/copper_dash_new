import type { Metadata } from 'next';
import { Newsreader, Manrope, Space_Grotesk } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import SectionTabs from '@/components/SectionTabs';
import Breadcrumbs from '@/components/Breadcrumbs';
import CollectionsBanner from '@/components/CollectionsBanner';
import { companyProfile, getSetting } from '@/lib/company';
import { collectionsSummary } from '@/lib/queries';
import { currentUser } from '@/lib/current-user';
import { resolveSession } from '@/lib/tenant-resolve';
import { runWithTenant } from '@/lib/tenant';
import { logout } from '@/lib/auth-actions';
import { featureForPath } from '@/lib/features';
import { DEFAULT_SETTINGS, type ClientSettings } from '@/lib/control-db';
import { dateLong, inr, today } from '@/lib/format';

const display = Newsreader({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-display' });
const body = Manrope({ subsets: ['latin'], variable: '--font-body' });
const mono = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'CopperBook',
  description: 'Copper procurement — suppliers, targets, orders and cost, in one place.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await resolveSession();
  // Blocked accounts (locked user, or suspended client) get a dead-end notice
  // instead of the app. Enforced here because edge middleware can't read the
  // control DB. Their DB is still never shown to anyone else.
  if (session && session.access !== 'ok') return blockedShell(session.access);
  const settings = session?.settings ?? DEFAULT_SETTINGS;
  // Route guard: a disabled feature's pages show a notice, not the data.
  const feat = featureForPath((await headers()).get('x-pathname') ?? '');
  const content = feat && settings.disabled.includes(feat) ? <FeatureOff /> : children;
  // Scope covers the layout's own data (below). Child pages render as separate
  // work and re-enter the scope themselves via withTenantPage.
  return runWithTenant(session?.tenant, () => renderShell(content, settings));
}

function FeatureOff() {
  return (
    <div className="card card-pad" style={{ textAlign: 'center', padding: '48px 24px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginBottom: 8 }}>Not enabled</h2>
      <p className="muted">This section isn’t part of your plan. Ask your administrator to turn it on.</p>
    </div>
  );
}

function blockedShell(reason: 'user-locked' | 'client-suspended') {
  const [title, msg] = reason === 'user-locked'
    ? ['Account locked', 'Your access has been locked. Please contact your administrator to restore it.']
    : ['Workspace on hold', 'Access to this workspace has been paused. Please contact your administrator to restore it.'];
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, fontFamily: 'var(--font-body)' }}>
          <div style={{ maxWidth: 460, textAlign: 'center' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, marginBottom: 10 }}>{title}</h1>
            <p style={{ color: '#6b6257', lineHeight: 1.6, marginBottom: 22 }}>{msg}</p>
            <form action={logout}><button type="submit" className="btn-order outline">Sign out</button></form>
          </div>
        </div>
      </body>
    </html>
  );
}

async function renderShell(children: React.ReactNode, settings: ClientSettings) {
  const co = companyProfile();
  const collect = collectionsSummary();
  const me = await currentUser();
  // Super-admin branding (control DB) overrides the client's own profile / appearance.
  const name = settings.brandName || co.name;
  const accent = settings.brandAccent || getSetting('ui:accent', 'copper');
  const density = getSetting('ui:density', 'comfortable');
  const bannerOn = getSetting('ui:banner', 'on') !== 'off';
  return (
    <html lang="en" data-accent={accent} data-density={density}>
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <div className="frame">
          <Sidebar name={name} logo={co.logo} city={co.city || 'Copper procurement'} admin={me?.role === 'SUPER_ADMIN'} disabled={settings.disabled} />
          <main className="main">
            <div className="topbar">
              <Breadcrumbs />
              <span className="topbar-date">{dateLong(today())}</span>
            </div>
            {bannerOn ? <CollectionsBanner count={collect.count} total={inr(collect.total)} overdue={inr(collect.overdue)} hasOverdue={collect.overdue > 1} /> : null}
            <SectionTabs disabled={settings.disabled} />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
