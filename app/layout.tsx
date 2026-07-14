import type { Metadata } from 'next';
import { Newsreader, Manrope, Space_Grotesk } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import SectionTabs from '@/components/SectionTabs';
import Breadcrumbs from '@/components/Breadcrumbs';
import CollectionsBanner from '@/components/CollectionsBanner';
import { companyProfile, getSetting } from '@/lib/company';
import { collectionsSummary } from '@/lib/queries';
import { currentUser } from '@/lib/current-user';
import { resolveTenant } from '@/lib/tenant-resolve';
import { runWithTenant } from '@/lib/tenant';
import { dateLong, inr, today } from '@/lib/format';

const display = Newsreader({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-display' });
const body = Manrope({ subsets: ['latin'], variable: '--font-body' });
const mono = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'CopperBook',
  description: 'Copper procurement — suppliers, targets, orders and cost, in one place.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Scope covers the layout's own data (below). Child pages render as separate
  // work and re-enter the scope themselves via withTenantPage.
  return runWithTenant(await resolveTenant(), () => renderShell(children));
}

async function renderShell(children: React.ReactNode) {
  const co = companyProfile();
  const collect = collectionsSummary();
  const me = await currentUser();
  const accent = getSetting('ui:accent', 'copper');
  const density = getSetting('ui:density', 'comfortable');
  const bannerOn = getSetting('ui:banner', 'on') !== 'off';
  return (
    <html lang="en" data-accent={accent} data-density={density}>
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <div className="frame">
          <Sidebar name={co.name} logo={co.logo} city={co.city || 'Copper procurement'} admin={me?.role === 'SUPER_ADMIN'} />
          <main className="main">
            <div className="topbar">
              <Breadcrumbs />
              <span className="topbar-date">{dateLong(today())}</span>
            </div>
            {bannerOn ? <CollectionsBanner count={collect.count} total={inr(collect.total)} overdue={inr(collect.overdue)} hasOverdue={collect.overdue > 1} /> : null}
            <SectionTabs />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
