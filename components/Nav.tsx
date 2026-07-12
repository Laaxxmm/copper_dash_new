'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const S = { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const LINKS = [
  {
    href: '/', label: 'Today',
    icon: <svg {...S}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>,
  },
  {
    href: '/where-to-buy', label: 'Where to buy',
    icon: <svg {...S}><path d="M4 20V9l8-5 8 5v11" /><path d="M9 20v-6h6v6" /><path d="M12 4v3" /></svg>,
  },
  {
    href: '/bookings', label: 'Bookings',
    icon: <svg {...S}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg>,
  },
  {
    href: '/trucks', label: 'Trucks',
    icon: <svg {...S}><path d="M2 7h11v9H2z" /><path d="M13 10h5l3 3v3h-8" /><circle cx="6.5" cy="17.5" r="1.6" /><circle cx="16.5" cy="17.5" r="1.6" /></svg>,
  },
  {
    href: '/money', label: 'Money',
    icon: <svg {...S}><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 10v.01M18 14v.01" /></svg>,
  },
  {
    href: '/profit', label: 'Profit',
    icon: <svg {...S}><path d="M3 20h18" /><path d="M5 16l4-5 4 3 6-8" /><path d="M15 6h4v4" /></svg>,
  },
  {
    href: '/parties', label: 'People',
    icon: <svg {...S}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.7-3 2.9-4.5 5.5-4.5S13.8 16 14.5 19" /><circle cx="17" cy="9.5" r="2.4" /><path d="M15.8 14.7c2.4.2 4 1.6 4.6 4.3" /></svg>,
  },
  {
    href: '/news', label: 'Market & news',
    icon: <svg {...S}><path d="M18 8a6 6 0 0 0-12 0c0 7-2 8-2 8h16s-2-1-2-8" /><path d="M10.3 20a2 2 0 0 0 3.4 0" /></svg>,
  },
  {
    href: '/reports', label: 'Reports',
    icon: <svg {...S}><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 19h16" /></svg>,
  },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <>
      <Link href="/add" className="nav-add">
        <svg {...S} width={17} height={17}><path d="M12 5v14M5 12h14" /></svg>
        Add entry
      </Link>
      <nav>
        {LINKS.map((l) => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} className={`nav-link${active ? ' active' : ''}`}>
              {l.icon}
              {l.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
