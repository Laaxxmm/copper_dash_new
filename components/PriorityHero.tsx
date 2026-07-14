import Link from 'next/link';

/** The one thing that needs you today. Dark card, corner ribbon, one huge number,
 *  one action. Kept deliberately singular — the antidote to a crowded dashboard. */
export default function PriorityHero({ tone, label, amount, sub, ctaHref, ctaLabel }: {
  tone: 'urgent' | 'due' | 'calm'; label: string; amount: string; sub: string; ctaHref: string; ctaLabel: string;
}) {
  return (
    <div className={`phero ${tone}`}>
      {tone !== 'calm' ? <div className="phero-ribbon">{tone === 'urgent' ? 'URGENT' : 'DUE'}</div> : null}
      <div className="phero-label">{label}</div>
      <div className="phero-num">{amount}</div>
      <div className="phero-sub">{sub}</div>
      <Link href={ctaHref} className="phero-cta">{ctaLabel} →</Link>
    </div>
  );
}
