import { withTenantPage } from '@/lib/tenant-resolve';
import { notFound } from 'next/navigation';
import { PageHead } from '@/components/ui';
import TemplateBuilder from '@/components/TemplateBuilder';
import { templateWithLines } from '@/lib/sale-pricing';

export const dynamic = 'force-dynamic';

async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const t = templateWithLines(Number((await params).id));
  if (!t) notFound();
  return (
    <>
      <PageHead title="Edit pricing template" sub="Reorder, add or change cost lines — the preview updates as you edit." />
      <TemplateBuilder id={t.id} name={t.name} notes={t.notes ?? ''} lines={t.lines} />
    </>
  );
}

export default withTenantPage(EditTemplatePage);
