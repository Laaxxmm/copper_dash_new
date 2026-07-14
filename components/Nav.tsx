'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const S = { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

// Routes that belong to each top-level section (drives sidebar highlighting).
export const PURCHASE_ROUTES = ['/suppliers', '/orders', '/po', '/inbox', '/news'];
export const SALES_ROUTES = ['/sales'];

const LINKS = [
  {
    href: '/', label: 'Dashboard', match: (p: string) => p === '/',
    icon: <svg {...S}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  },
  {
    href: '/suppliers', label: 'Purchase', match: (p: string) => PURCHASE_ROUTES.some((r) => p.startsWith(r)),
    icon: <svg {...S}><path d="M4 20V9l8-5 8 5v11" /><path d="M9 20v-6h6v6" /><path d="M12 4v3" /></svg>,
  },
  {
    href: '/sales', label: 'Sales', match: (p: string) => p.startsWith('/sales'),
    icon: <svg {...S}><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /><path d="M19 7h-3M19 7v3" /></svg>,
  },
  {
    href: '/finance', label: 'Finance', match: (p: string) => p.startsWith('/finance'),
    icon: <svg {...S}><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 10v.01M18 14v.01" /></svg>,
  },
  {
    href: '/settings', label: 'Settings', match: (p: string) => p.startsWith('/settings'),
    icon: <svg {...S}><circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v2.5M12 18v2.5M4.5 7.5l2.2 1.3M17.3 15.2l2.2 1.3M19.5 7.5l-2.2 1.3M6.7 15.2l-2.2 1.3" /></svg>,
  },
];

const ADMIN_LINK = {
  href: '/admin', label: 'Admin', match: (p: string) => p.startsWith('/admin'),
  icon: <svg {...S}><path d="M12 3l7 4v5c0 4.4-3 7.5-7 9-4-1.5-7-4.6-7-9V7z" /><path d="M9.5 12l2 2 3.5-4" /></svg>,
} as const;

export default function Nav({ admin = false }: { admin?: boolean }) {
  const pathname = usePathname();
  const links = admin ? [...LINKS, ADMIN_LINK] : LINKS;
  return (
    <>
      <Link href="/add" className="nav-add" title="Add entry">
        <svg {...S} width={17} height={17}><path d="M12 5v14M5 12h14" /></svg>
        <span className="nav-label">Add entry</span>
      </Link>
      <nav>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={`nav-link${l.match(pathname) ? ' active' : ''}`} title={l.label}>
            {l.icon}
            <span className="nav-label">{l.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
