'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const S = { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const LINKS = [
  {
    href: '/', label: 'Dashboard',
    icon: <svg {...S}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  },
  {
    href: '/suppliers', label: 'Suppliers',
    icon: <svg {...S}><path d="M4 20V9l8-5 8 5v11" /><path d="M9 20v-6h6v6" /><path d="M12 4v3" /></svg>,
  },
  {
    href: '/orders', label: 'Orders',
    icon: <svg {...S}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></svg>,
  },
  {
    href: '/inbox', label: 'Inbox',
    icon: <svg {...S}><path d="M3 12h5l2 3h4l2-3h5" /><path d="M4 5h16v14H4z" /></svg>,
  },
  {
    href: '/news', label: 'Market',
    icon: <svg {...S}><path d="M3 20h18" /><path d="M5 16l4-5 4 3 6-8" /><path d="M15 6h4v4" /></svg>,
  },
  {
    href: '/settings', label: 'Settings',
    icon: <svg {...S}><circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v2.5M12 18v2.5M4.5 7.5l2.2 1.3M17.3 15.2l2.2 1.3M19.5 7.5l-2.2 1.3M6.7 15.2l-2.2 1.3" /></svg>,
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
