import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Interim: the dedicated supplier page (calculator + targets + PI/PO log) lands in Phase C.
// Until then, show the existing party detail so the link is never dead.
export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/parties/${id}`);
}
