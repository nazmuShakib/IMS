import Link from 'next/link';
import { db } from '@/repositories';
import { requireRole } from '@/lib/session';
import { createProduct } from '@/actions/catalog';
import { ProductForm } from '@/components/catalog/ProductForm';
import { PageHeader, EmptyState, Card, Button } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  await requireRole('ADMIN', 'MANAGER'); // guard the page, not just the action

  const [categories, brands] = await Promise.all([
    db.categories.findAll(),
    db.brands.findAll(),
  ]);

  if (categories.length === 0) {
    return (
      <>
        <PageHeader title="Add product" />
        <Card>
          <EmptyState
            title="A product needs a category. Create one first."
            action={
              <Link href="/categories">
                <Button>Go to categories</Button>
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Add product" count="Stock starts at zero — receive it in Phase 2" />
      <ProductForm action={createProduct} categories={categories} brands={brands} />
    </>
  );
}
