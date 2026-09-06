import { CheckoutWorkspace } from '@/components/checkout/CheckoutWorkspace';
import { PageHeader } from '@/components/ui';
import { getSession, requirePageCapability } from '@/lib/session';
import { createTranslator } from '@/lib/i18n/messages';
import { db } from '@/repositories';
import { getOrCreateCart } from '@/services/checkout';
import { INVOICE_LOGO_SRC } from '@/lib/shop-branding';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ serial?: string; tradeIn?: string }>;
}) {
  const actor = await requirePageCapability('CHECKOUT');
  const { locale } = await getSession();
  const { serial = '', tradeIn } = await searchParams;
  const t = createTranslator(locale);
  const cart = await getOrCreateCart(actor.id);
  const [products, units, customers] = await Promise.all([
    db.products.findAll({ activeOnly: true }),
    db.units.findAllInStock(),
    db.customers.findAll(true),
  ]);
  const productsById = new Map(products.map((product) => [product.id, product]));
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
        key={serial || 'checkout'}
        cart={cart}
        initialTradeInOpen={tradeIn === '1'}
        shopName={process.env.SHOP_NAME?.trim() || 'Irfan Gadget & Mobile'}
        shopLogoDataUri={process.env.SHOP_LOGO_DATA_URI?.trim() || INVOICE_LOGO_SRC}
        initialIdentifier={serial}
        lines={[]}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          model: product.model,
          sku: product.sku,
          trackingType: product.trackingType,
          onHand: product.trackingType === 'SERIAL'
            ? serialCounts.get(product.id) ?? 0
            : product.quantityOnHand,
          barcode: product.barcode,
          listUnitPrice: product.defaultSalePrice,
          staffMaxDiscount: product.staffMaxDiscount,
        }))}
        units={units.flatMap((unit) => {
          const product = productsById.get(unit.productId);
          return product ? [{
            id: unit.id,
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            serialNo: unit.serialNo,
            usedGrade: unit.usedGrade ?? null,
            listUnitPrice: unit.askingPrice ?? (unit.usedGrade === 'REFURBISHED' ? unit.costPrice : product.defaultSalePrice),
            staffMaxDiscount: product.staffMaxDiscount,
            knownDefects: unit.knownDefects ?? null,
            cosmeticCondition: unit.cosmeticCondition ?? null,
            warrantyMonths: unit.warrantyMonths ?? null,
            warrantyDays: unit.warrantyDays ?? null,
          }] : [];
        })}
        customers={customers}
        role={actor.role}
      />
    </>
  );
}
