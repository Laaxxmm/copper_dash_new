import { PageHead } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function FinancePage() {
  return (
    <>
      <PageHead title="Finance" sub="Overheads and true profitability — what the business actually makes after every cost." />
      <div className="card card-pad">
        <div className="card-title">Coming in the Finance phase</div>
        <p className="muted" style={{ fontSize: 14.5, lineHeight: 1.6 }}>
          This is where you&apos;ll record monthly overheads — salary, rent, power, and any other cost — and see
          them averaged into the numbers, so the Dashboard can show <b>real profitability, overall and per
          customer</b>. It arrives after the sell-order and pricing pieces are in place.
        </p>
      </div>
    </>
  );
}
