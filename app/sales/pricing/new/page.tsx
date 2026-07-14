import { PageHead } from '@/components/ui';
import TemplateBuilder from '@/components/TemplateBuilder';

export const dynamic = 'force-dynamic';

export default function NewTemplatePage() {
  return (
    <>
      <PageHead title="New pricing template" sub="Add cost lines and pick an operator for each — the selling price builds up live as you go." />
      <TemplateBuilder id={0} name="" notes="" lines={[]} />
    </>
  );
}
