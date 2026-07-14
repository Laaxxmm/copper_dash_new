import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Interim: the full customer page (history, ledger, collections, profitability) lands in S4.
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/parties/${id}`);
}
