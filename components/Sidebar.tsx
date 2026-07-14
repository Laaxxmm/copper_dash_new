'use client';

import { useState, useEffect } from 'react';
import Nav from './Nav';
import { logout } from '@/lib/auth-actions';

/** Collapsible dark rail. Remembers the user's choice; auto-collapses under 980px. */
export default function Sidebar({ name, logo, city, admin = false }: { name: string; logo: string; city: string; admin?: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 980px)');
    const apply = () => setCollapsed(mq.matches || localStorage.getItem('cb_sidebar') === '1');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  const toggle = () => setCollapsed((c) => { const n = !c; localStorage.setItem('cb_sidebar', n ? '1' : '0'); return n; });

  const clean = name.replace(/\s*\(P\)\s*LTD\.?/i, '');
  const [lead, ...rest] = clean.split(' ');

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="brand-block">
        <div className="brand-txt">
          {logo
            ? <img src={logo} alt={name} className="brand-logo" />
            : <div className="brand"><span className="cu">{collapsed ? lead.slice(0, 1) : lead}</span>{!collapsed && (rest.length ? ' ' + rest.join(' ') : '')}</div>}
          {!collapsed && city ? <div className="brand-sub">{city}</div> : null}
        </div>
        <button type="button" className="sb-toggle" onClick={toggle} aria-label={collapsed ? 'Expand' : 'Collapse'} title={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? '»' : '«'}</button>
      </div>
      <Nav admin={admin} />
      <div className="nav-foot">
        <form action={logout}><button type="submit" className="nav-signout">{collapsed ? '⎋' : 'Sign out'}</button></form>
        <div style={{ marginTop: 10 }}>All figures live from the register. Prices in ₹ per kg unless marked.</div>
      </div>
    </aside>
  );
}
