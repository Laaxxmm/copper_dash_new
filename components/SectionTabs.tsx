'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PURCHASE_ROUTES } from './Nav';

const PURCHASE_TABS = [
  { href: '/suppliers', label: 'Suppliers' },
  { href: '/orders', label: 'Orders' },
  { href: '/inbox', label: 'Supplier inbox' },
  { href: '/news', label: 'Market' },
];
const SALES_TABS = [
  { href: '/sales', label: 'Customers' },
  { href: '/sales/pricing', label: 'Products & pricing' },
];

/** Secondary tab bar for the active section. Nothing on Dashboard/Finance/Settings. */
export default function SectionTabs() {
  const pathname = usePathname();
  const inPurchase = PURCHASE_ROUTES.some((r) => pathname.startsWith(r));
  const inSales = pathname.startsWith('/sales');
  const tabs = inPurchase ? PURCHASE_TABS : inSales ? SALES_TABS : null;
  if (!tabs) return null;
  return (
    <div className="section-tabs">
      {tabs.map((t) => {
        const active = t.href === '/sales' ? pathname === '/sales' || pathname.startsWith('/sales/customers') : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={`stab${active ? ' on' : ''}`}>{t.label}</Link>
        );
      })}
    </div>
  );
}
