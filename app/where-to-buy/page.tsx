import { PageHead } from '@/components/ui';
import WhereToBuyClient from '@/components/WhereToBuyClient';
import { cspToday, typicalSellRate, whereToBuy } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default function WhereToBuyPage() {
  const suppliers = whereToBuy();
  const csp = cspToday();
  return (
    <>
      <PageHead
        title="Where to buy"
        sub="Every supplier, ranked by how much you keep per kilo. The one at the top gives you the best margin today."
      />
      <WhereToBuyClient suppliers={suppliers} marketKg={csp.price / 1000} sellDefaultKg={typicalSellRate() / 1000} />
    </>
  );
}
