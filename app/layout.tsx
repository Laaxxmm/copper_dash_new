import type { Metadata } from 'next';
import { Spectral, Hanken_Grotesk, Spline_Sans_Mono } from 'next/font/google';
import './globals.css';
import Nav from '@/components/Nav';
import { logout } from '@/lib/auth-actions';

const display = Spectral({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-display' });
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-body' });
const mono = Spline_Sans_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'CopperBook',
  description: 'Bookings, trucks, money and profit — the whole copper business in one place.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <div className="frame">
          <aside className="sidebar">
            <div className="brand"><span className="cu">Copper</span>Book</div>
            <div className="brand-sub">Trade Register</div>
            <Nav />
            <div className="nav-foot">
              <form action={logout}>
                <button type="submit" className="nav-signout">Sign out</button>
              </form>
              <div style={{ marginTop: 10 }}>All figures live from the trade register. Prices in ₹ per kg unless marked.</div>
            </div>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
