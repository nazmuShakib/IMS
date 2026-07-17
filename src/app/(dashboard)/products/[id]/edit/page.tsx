import { notFound } from 'next/navigation';
import { db } from '@/repositories';
import { requireRole } from '@/lib/session';
import { updateProduct } from '@/actions/catalog';
import { ProductForm } from '@/components/catalog/ProductForm';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('ADMIN', 'MANAGER');
  const { id } = await params;

  const [product, categories, brands] = await Promise.all([
    db.products.findById(id),
    db.categories.findAll(),
    db.brands.findAll(),
  ]);

  if (!product) notFound();

  return (
    <>
      <PageHeader title="Edit product" count={product.sku} />
      <ProductForm
        action={updateProduct}
        categories={categories}
        brands={brands}
        product={product}
      />
    </>
  );
}
