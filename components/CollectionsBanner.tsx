'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/** Week-ahead "money to collect" pop-up. Dismissible for the session (returns next
 *  session — it's a reminder). Server passes the pre-formatted figures. */
export default function CollectionsBanner({ count, total, overdue, hasOverdue }: {
  count: number; total: string; overdue: string; hasOverdue: boolean;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(sessionStorage.getItem('cb_collect_dismiss') !== '1'); }, []);
  if (count === 0 || !show) return null;
  return (
    <div className={`collect-banner${hasOverdue ? ' urgent' : ''}`}>
      <span className="cb-dot" />
      <span className="cb-text">
        <b>{total}</b> to collect from {count} bill{count > 1 ? 's' : ''} due this week
        {hasOverdue ? <> · <span className="cb-over">{overdue} already overdue</span></> : null}
      </span>
      <Link href="/sales" className="cb-link">Review →</Link>
      <button type="button" className="cb-x" aria-label="dismiss" onClick={() => { sessionStorage.setItem('cb_collect_dismiss', '1'); setShow(false); }}>✕</button>
    </div>
  );
}
