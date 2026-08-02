import { CheckoutWorkspace } from '@/components/checkout/CheckoutWorkspace';
import { PageHeader } from '@/components/ui';
import { getSession, requireCapability } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import { db } from '@/repositories';
import { getOrCreateCart } from '@/services/checkout';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const actor = await requireCapability('CHECKOUT');
  const { locale } = await getSession();
  const t = createTranslator(locale);
  const cart = await getOrCreateCart(actor.id);
  const [items, products, units, customers] = await Promise.all([
    db.carts.findItems(cart.id),
    db.products.findAll({ activeOnly: true }),
    db.units.findAllInStock(),
    db.customers.findAll(true),
  ]);
  const productsById = new Map(products.map((product) => [product.id, product]));
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const missingSelectedUnits = await Promise.all(
    items
      .map((item) => item.unitId)
      .filter((id): id is string => id !== null)
      .filter((id) => !unitsById.has(id))
      .map((id) => db.units.findById(id)),
  );
  for (const unit of missingSelectedUnits) {
    if (unit) unitsById.set(unit.id, unit);
  }
  const serialCounts = new Map<string, number>();
  for (const unit of units) {
    serialCounts.set(unit.productId, (serialCounts.get(unit.productId) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        title={t('checkout.title')}
        count={t('checkout.help')}
      />
      <CheckoutWorkspace
        cart={cart}
        lines={items.flatMap((item) => {
          const product = productsById.get(item.productId);
          if (!product) return [];
          const unit = item.unitId ? unitsById.get(item.unitId) : null;
          return [{
            id: item.id,
            productId: item.productId,
            unitId: item.unitId,
            productName: product.name,
            sku: product.sku,
            serialNo: unit?.serialNo ?? null,
            trackingType: product.trackingType,
            quantity: item.quantity,
            listUnitPrice: item.listUnitPrice,
            actualUnitPrice: item.actualUnitPrice,
            onHand: product.trackingType === 'SERIAL' ? 1 : product.quantityOnHand,
          }];
        })}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          trackingType: product.trackingType,
          onHand: product.trackingType === 'SERIAL'
            ? serialCounts.get(product.id) ?? 0
            : product.quantityOnHand,
        }))}
        units={units.flatMap((unit) => {
          const product = productsById.get(unit.productId);
          return product ? [{
            id: unit.id,
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            serialNo: unit.serialNo,
          }] : [];
        })}
        customers={customers}
      />
    </>
  );
}
