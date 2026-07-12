'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

type Point = { price_date: string; price_inr_mt: number };

export default function PriceChart({ data, height = 220 }: { data: Point[]; height?: number }) {
  const rows = data.map((d) => ({
    date: d.price_date,
    kg: +(d.price_inr_mt / 1000).toFixed(1),
  }));
  const min = Math.floor(Math.min(...rows.map((r) => r.kg)) / 10) * 10;
  const max = Math.ceil(Math.max(...rows.map((r) => r.kg)) / 10) * 10;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--line-soft)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11.5, fill: 'var(--ink-3)' }}
          tickFormatter={(v: string) => new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={42}
        />
        <YAxis
          domain={[min, max]} width={44}
          tick={{ fontSize: 11.5, fill: 'var(--ink-3)' }}
          tickFormatter={(v: number) => `₹${v}`}
          tickLine={false} axisLine={false}
        />
        <Tooltip
          formatter={(v) => [`₹${v} per kg`, 'Copper price']}
          labelFormatter={(v: string) => new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 13 }}
        />
        <Area type="monotone" dataKey="kg" stroke="var(--cat-1)" strokeWidth={2} fill="var(--cat-1)" fillOpacity={0.08} dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
