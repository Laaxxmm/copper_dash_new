'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

type Row = { month: string; bought: number; sold: number };

const toL = (x: number) => +(x / 100000).toFixed(1);

export default function TradeChart({ data, height = 240 }: { data: Row[]; height?: number }) {
  const rows = data.map((d) => ({
    month: new Date(d.month + '-01').toLocaleDateString('en-IN', { month: 'short' }),
    Bought: toL(d.bought),
    Sold: toL(d.sold),
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={3}>
        <CartesianGrid stroke="var(--line-soft)" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--ink-3)' }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
        <YAxis width={52} tick={{ fontSize: 11.5, fill: 'var(--ink-3)' }} tickFormatter={(v: number) => `₹${v}L`} tickLine={false} axisLine={false} />
        <Tooltip
          formatter={(v, name) => [`₹${Number(v).toLocaleString('en-IN')} lakh`, name === 'Sold' ? 'Sold (before GST)' : 'Bought (before GST)']}
          contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 13 }}
          cursor={{ fill: 'rgba(180,85,29,0.05)' }}
        />
        <Bar dataKey="Sold" fill="var(--cat-1)" radius={[4, 4, 0, 0]} maxBarSize={26} />
        <Bar dataKey="Bought" fill="var(--cat-2)" radius={[4, 4, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}
