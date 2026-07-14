import type { Metadata } from 'next';
import { Newsreader, Manrope, Space_Grotesk } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import SectionTabs from '@/components/SectionTabs';
import Breadcrumbs from '@/components/Breadcrumbs';
import CollectionsBanner from '@/components/CollectionsBanner';
import { companyProfile } from '@/lib/company';
import { collectionsSummary } from '@/lib/queries';
import { dateLong, inr, today } from '@/lib/format';

const display = Newsreader({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-display' });
const body = Manrope({ subsets: ['latin'], variable: '--font-body' });
const mono = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'CopperBook',
  description: 'Copper procurement — suppliers, targets, orders and cost, in one place.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const co = companyProfile();
  const collect = collectionsSummary();
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <div className="frame">
          <Sidebar name={co.name} logo={co.logo} city={co.city || 'Copper procurement'} />
          <main className="main">
            <div className="topbar">
              <Breadcrumbs />
              <span className="topbar-date">{dateLong(today())}</span>
            </div>
            <CollectionsBanner count={collect.count} total={inr(collect.total)} overdue={inr(collect.overdue)} hasOverdue={collect.overdue > 1} />
            <SectionTabs />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
