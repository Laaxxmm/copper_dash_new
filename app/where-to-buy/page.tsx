import { PageHead } from '@/components/ui';
import BuyBoardClient from '@/components/BuyBoardClient';
import { products, supplierBoard } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export default async function WhereToBuyPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product } = await searchParams;
  const prods = products();
  const productId =
    (product && prods.find((p) => p.id === Number(product))?.id) ||
    prods.find((p) => p.type === 'WIRE' && p.size_mm === 1.6)?.id ||
    prods[0]?.id;

  const board = supplierBoard(productId!);
  // Default sell just above the cheapest buy, so the margin is realistic to start.
  const defaultSellKg = board.rows.length ? board.rows[0].rate_inr_kg + 10 : 1000;

  return (
    <>
      <PageHead
        title="Where to buy"
        sub="Every supplier, ranked by your real buy rate for the chosen product. The one at the top (L1) is cheapest today."
      />
      {prods.length === 0 || board.rows.length === 0 ? (
        <div className="help">
          No supplier pricing yet. Add suppliers and their premium/factor/handling per product, plus today&apos;s LME,
          and the board will rank them here.
        </div>
      ) : (
        <BuyBoardClient
          products={prods}
          productId={productId!}
          rows={board.rows}
          lme={board.lme}
          source={board.source}
          asOf={board.asOf}
          defaultSellKg={defaultSellKg}
        />
      )}
    </>
  );
}
