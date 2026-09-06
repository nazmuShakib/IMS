import Link from 'next/link';
import { redirect } from 'next/navigation';
import { UsedDeviceIntakeForm } from '@/components/stock/UsedDeviceIntakeForm';
import { PageHeader } from '@/components/ui';
import { getSession, requirePageCapability } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import { db } from '@/repositories';

export const dynamic = 'force-dynamic';

export default async function UsedDeviceIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ cart?: string | string[] }>;
}) {
  const actor = await requirePageCapability('MANAGE_USED_DEVICES');
  const { cart: requestedCartId } = await searchParams;
  const requestedCart = typeof requestedCartId === 'string' && requestedCartId ? await db.carts.findById(requestedCartId) : null;

  const { locale } = await getSession();
  const t = createTranslator(locale);
  if (requestedCartId !== undefined) {
    if (requestedCart?.actorId === actor.id) redirect('/checkout?tradeIn=1');
    return <><PageHeader title={t('used.cartUnavailable')} count={t('used.cartUnavailableHelp')} /><Link className="intake-link" href="/checkout">{t('used.backCheckout')}</Link></>;
  }
  const products = (await db.products.findAll({ activeOnly: true }))
    .filter((product) => product.trackingType === 'SERIAL')
    .map((product) => ({ id: product.id, sku: product.sku, name: product.name, model: product.model, barcode: product.barcode }));
  return (
    <>
      <PageHeader
        title={t('used.title')}
        count={t('used.pageHelp')}
      />
      <UsedDeviceIntakeForm
        products={products}
        mode="purchase"
      />
    </>
  );
}
