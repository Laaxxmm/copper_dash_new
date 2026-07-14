'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { mt } from '@/lib/format';

type Row = {
  supplier_id: number; supplier: string; manual_rank: number | null;
  target_mt: number; agreed_mt: number; lifted_mt: number; avg_cost_kg: number | null;
};

function status(r: Row): { label: string; cls: string } {
  const base = r.target_mt || r.agreed_mt;
  const pct = base > 0 ? (r.lifted_mt / base) * 100 : 0;
  if (r.lifted_mt <= 0.01) return { label: 'IDLE', cls: 'idle' };
  if (pct >= 100) return { label: 'ON TRACK', cls: 'good' };
  if (pct >= 40) return { label: 'RUNNING', cls: 'warn' };
  return { label: 'LOW LIFT', cls: 'warn' };
}

export default function SupplierCarousel({ rows }: { rows: Row[] }) {
  const track = useRef<HTMLDivElement>(null);
  const slide = (dir: -1 | 1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth / 3 + 14), behavior: 'smooth' });
  };

  return (
    <div className="section-gap">
      <div className="carousel-head">
        <div className="section-title" style={{ margin: 0 }}>Suppliers this month — target vs lifted</div>
        {rows.length > 3 ? (
          <div className="carousel-arrows">
            <button type="button" onClick={() => slide(-1)} aria-label="previous">‹</button>
            <button type="button" onClick={() => slide(1)} aria-label="next">›</button>
          </div>
        ) : null}
      </div>
      <div className="carousel-track" ref={track}>
        {rows.map((r) => {
          const s = status(r);
          const base = r.target_mt || r.agreed_mt;
          const pct = base > 0 ? Math.min(100, Math.round((r.lifted_mt / base) * 100)) : 0;
          return (
            <Link key={r.supplier_id} href={`/suppliers/${r.supplier_id}`} className="sc2">
              <div className="sc2-top">
                <span className="sc2-name">{r.supplier}</span>
                <span className={`spill ${s.cls}`}>{s.label}</span>
              </div>
              <div className="sc2-nums">
                <div className="sc2-small">
                  <div><b>{mt(r.target_mt)}</b><i>target</i></div>
                  <div><b>{mt(r.agreed_mt)}</b><i>agreed</i></div>
                </div>
                <div className={`sc2-lifted ${s.cls}`}>
                  <span>{mt(Math.round(r.lifted_mt * 10) / 10)}</span><i>lifted</i>
                </div>
              </div>
              <div className="sc2-foot">
                <span>{pct}% of {r.target_mt > 0 ? 'target' : 'agreed'}</span>
                <span>{r.avg_cost_kg ? `avg ₹${r.avg_cost_kg.toFixed(1)}/kg` : 'no lift priced'}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
