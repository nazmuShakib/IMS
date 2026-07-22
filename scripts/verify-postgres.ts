import { uuidv7 } from '@/lib/ids';
import { prismaRepositories } from '@/repositories/prisma';

class RollbackVerification extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  if (process.env.DATA_SOURCE !== 'postgres') {
    throw new Error('db:verify requires DATA_SOURCE=postgres.');
  }

  const categoryId = uuidv7();
  const brandId = uuidv7();
  const supplierId = uuidv7();
  const bulkProductId = uuidv7();
  const serialProductId = uuidv7();
  const unitId = uuidv7();
  const now = new Date().toISOString();

  try {
    await prismaRepositories.transaction(async (tx) => {
      await tx.categories.create({
        id: categoryId, name: `Verification ${categoryId}`, slug: `verify-${categoryId}`,
        parentId: null, isActive: true,
      });
      await tx.brands.create({
        id: brandId, name: `Verification ${brandId}`, slug: `verify-${brandId}`, isActive: true,
      });
      await tx.suppliers.create({
        id: supplierId, name: `Verification ${supplierId}`, phone: null, email: null,
        address: null, note: null, isActive: true,
      });

      await tx.products.create({
        id: bulkProductId, sku: `VERIFY-BULK-${bulkProductId}`, barcode: null,
        name: `Verification bulk ${bulkProductId}`, description: null, model: null,
        trackingType: 'QUANTITY', categoryId, brandId, defaultCostPrice: 1_000,
        defaultSalePrice: 1_500, taxRate: 0, reorderPoint: 1, quantityOnHand: 0,
        avgCostPrice: 0, imageUrl: null, isActive: true, createdAt: now, updatedAt: now,
      });
      await tx.products._applyQuantityDelta(bulkProductId, 5, 1_000);
      const bulkMovement = await tx.movements.record({
        id: uuidv7(), type: 'IN', reason: 'PURCHASE', productId: bulkProductId,
        unitId: null, quantity: 5, unitCost: 1_000, unitPrice: null, supplierId,
        customerName: null, customerPhone: null, reference: 'ROLLBACK-VERIFY', note: null,
        actorId: null, idempotencyKey: uuidv7(), reversesId: null, createdAt: now,
      });
      assert((await tx.movements.findByIdempotencyKey(bulkMovement.idempotencyKey!))?.id === bulkMovement.id, 'Idempotency lookup failed.');
      assert(await tx.movements.sumQuantity(bulkProductId) === 5, 'Quantity ledger sum failed.');

      await tx.products.create({
        id: serialProductId, sku: `VERIFY-SERIAL-${serialProductId}`, barcode: null,
        name: `Verification serial ${serialProductId}`, description: null, model: null,
        trackingType: 'SERIAL', categoryId, brandId, defaultCostPrice: 50_000,
        defaultSalePrice: 60_000, taxRate: 0, reorderPoint: 1, quantityOnHand: 0,
        avgCostPrice: 0, imageUrl: null, isActive: true, createdAt: now, updatedAt: now,
      });
      await tx.units.createMany([{
        id: unitId, serialNo: `VERIFY-${unitId}`, productId: serialProductId,
        status: 'IN_STOCK', costPrice: 50_000, salePrice: null, supplierId,
        receivedAt: now, soldAt: null, warrantyMonths: 12, warrantyExpiresAt: null,
        location: null, note: null, createdAt: now, updatedAt: now,
      }]);
      await tx.movements.record({
        id: uuidv7(), type: 'IN', reason: 'PURCHASE', productId: serialProductId,
        unitId, quantity: 1, unitCost: 50_000, unitPrice: null, supplierId,
        customerName: null, customerPhone: null, reference: 'ROLLBACK-VERIFY', note: null,
        actorId: null, idempotencyKey: uuidv7(), reversesId: null, createdAt: now,
      });
      await tx.units.transitionStatus(unitId, 'IN_STOCK', 'SOLD', {
        salePrice: 60_000, soldAt: now,
      });
      const saleMovement = await tx.movements.record({
        id: uuidv7(), type: 'OUT', reason: 'SALE', productId: serialProductId,
        unitId, quantity: -1, unitCost: 50_000, unitPrice: 60_000, supplierId: null,
        customerName: null, customerPhone: null, reference: 'ROLLBACK-VERIFY', note: null,
        actorId: null, idempotencyKey: uuidv7(), reversesId: null, createdAt: now,
      });
      assert(await tx.units.countInStock(serialProductId) === 0, 'Serial status transition failed.');
      assert(await tx.movements.sumQuantity(serialProductId) === 0, 'Serial ledger sum failed.');
      assert((await tx.products.search(bulkProductId)).length === 1, 'PostgreSQL product search failed.');

      const actor = (await tx.users.findAll())[0];
      assert(actor, 'RMA verification needs the bootstrapped administrator.');
      const claimId = uuidv7();
      const claimNumber = await tx.warranties.nextClaimNumber(new Date(now));
      await tx.warranties.create({
        id: claimId, claimNumber, idempotencyKey: uuidv7(), unitId,
        saleMovementId: saleMovement.id, claimantName: 'Rollback verification',
        claimantPhone: null, reportedIssue: 'Rollback-only warranty verification',
        physicalCondition: null, status: 'SUBMITTED', coverage: 'IN_WARRANTY',
        custody: 'RECEIVED_BY_SHOP', resolution: null, openedById: actor.id,
        assignedToId: null, openedAt: now, completedAt: null, updatedAt: now,
      });
      await tx.warranties.createEvent({
        id: uuidv7(), claimId, eventType: 'CLAIM_CREATED', idempotencyKey: uuidv7(),
        fromStatus: null, toStatus: 'SUBMITTED', fromCustody: null,
        toCustody: 'RECEIVED_BY_SHOP', note: 'Rollback verification',
        actorId: actor.id, createdAt: now,
      });
      assert((await tx.warranties.findById(claimId))?.claimNumber === claimNumber, 'Warranty claim persistence failed.');
      assert((await tx.warranties.findEvents(claimId)).length === 1, 'Warranty timeline persistence failed.');

      // This intentional error proves the entire verification flow is rolled back.
      throw new RollbackVerification();
    });
  } catch (error) {
    if (!(error instanceof RollbackVerification)) throw error;
  }

  const [bulk, serial] = await Promise.all([
    prismaRepositories.products.findById(bulkProductId),
    prismaRepositories.products.findById(serialProductId),
  ]);
  assert(!bulk && !serial, 'Verification rollback failed; temporary products remain.');
  console.log('PostgreSQL repository verification passed; transaction rolled back with no dummy data retained.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
