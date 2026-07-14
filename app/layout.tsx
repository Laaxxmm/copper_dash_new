import type { Metadata } from 'next';
import { Spectral, Hanken_Grotesk, Spline_Sans_Mono } from 'next/font/google';
import './globals.css';
import Nav from '@/components/Nav';
import SectionTabs from '@/components/SectionTabs';
import { logout } from '@/lib/auth-actions';
import { companyProfile } from '@/lib/company';
import { dateLong, today } from '@/lib/format';

const display = Spectral({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-display' });
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-body' });
const mono = Spline_Sans_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'CopperBook',
  description: 'Copper procurement — suppliers, targets, orders and cost, in one place.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const co = companyProfile();
  // First word as the copper-accented lead, rest in ink — keeps the wordmark tidy for long names.
  const [lead, ...rest] = co.name.replace(/\s*\(P\)\s*LTD\.?/i, '').split(' ');
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <div className="frame">
          <aside className="sidebar">
            <div className="brand-block">
              {co.logo
                ? <img src={co.logo} alt={co.name} className="brand-logo" />
                : <div className="brand"><span className="cu">{lead}</span>{rest.join(' ')}</div>}
              <div className="brand-sub">{co.city || 'Copper procurement'}</div>
            </div>
            <Nav />
            <div className="nav-foot">
              <form action={logout}>
                <button type="submit" className="nav-signout">Sign out</button>
              </form>
              <div style={{ marginTop: 10 }}>All figures live from the register. Prices in ₹ per kg unless marked.</div>
            </div>
          </aside>
          <main className="main">
            <div className="topbar"><span className="topbar-date">{dateLong(today())}</span></div>
            <SectionTabs />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
