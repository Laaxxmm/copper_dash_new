'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// First path segment → section label (matches the top-level nav).
const SECTION: Record<string, string> = {
  suppliers: 'Purchase', orders: 'Purchase', po: 'Purchase', inbox: 'Purchase', news: 'Market',
  sales: 'Sales', finance: 'Finance', settings: 'Settings', add: 'Add entry', parties: 'People',
  requirements: 'Requirements',
};

export default function Breadcrumbs() {
  const pathname = usePathname();
  if (pathname === '/') return null;
  const seg = pathname.split('/').filter(Boolean)[0];
  const label = SECTION[seg] ?? (seg ? seg[0].toUpperCase() + seg.slice(1) : '');
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <Link href="/">Home</Link>
      <span className="crumb-sep">›</span>
      <span className="here">{label}</span>
    </nav>
  );
}
