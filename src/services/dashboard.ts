import type { Product, ProductUnit, Role, StockMovement, User } from '@/domain/types';
import type { Paisa } from '@/lib/money';
import { canSeeCosts } from '@/lib/permissions';
import { db } from '@/repositories';
import type { Repositories } from '@/repositories';

const DAY_MS = 86_400_000;

export interface DashboardProductRow {
  productId: string;
  name: string;
  sku: string;
  onHand: number;
  reorderPoint: number;
}

export interface DashboardActivity {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  reason: StockMovement['reason'];
  quantity: number;
  actorId: string | null;
  actorName: string;
  createdAt: string;
}

export interface WarrantyAlert {
  unitId: string;
  serialNo: string;
  productId: string;
  productName: string;
  status: ProductUnit['status'];
  warrantyExpiresAt: string;
  daysRemaining: number;
}

export interface MoverRow extends DashboardProductRow {
  movedLast30Days: number;
}

export interface DailyOperationsPoint {
  date: string;
  stockIn: number;
  stockOut: number;
}

export interface DailyFinancialPoint {
  date: string;
  stockValue: Paisa;
  revenue: Paisa;
  margin: Paisa;
}

interface DashboardCommon {
  generatedAt: string;
  totalUnits: number;
  distinctSkus: number;
  lowStockCount: number;
  outOfStockCount: number;
  lowStock: DashboardProductRow[];
  deadStock: Array<DashboardProductRow & { lastOutAt: string | null; inactiveDays: number | null }>;
  recentActivity: DashboardActivity[];
  expiringWarranties: WarrantyAlert[];
  topMovers: MoverRow[];
  slowMovers: MoverRow[];
  dailyOperations: DailyOperationsPoint[];
}

export interface StaffDashboardDTO extends DashboardCommon {
  canSeeFinancials: false;
}

export interface FinancialDashboardDTO extends DashboardCommon {
  canSeeFinancials: true;
  stockValueAtCost: Paisa;
  stockValueAtRetail: Paisa;
  potentialMargin: Paisa;
  monthRevenue: Paisa;
  monthCogs: Paisa;
  monthGrossProfit: Paisa;
  monthOperatingExpenses: Paisa;
  monthShrinkage: Paisa;
  monthOperatingProfit: Paisa;
  dailyFinancials: DailyFinancialPoint[];
}

export type DashboardDTO = StaffDashboardDTO | FinancialDashboardDTO;

function startOfDhakaDay(date: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  // Dhaka is UTC+6 year-round.
  return new Date(`${value('year')}-${value('month')}-${value('day')}T00:00:00+06:00`);
}

function dhakaDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function monthStartDhaka(now: Date): Date {
  const day = startOfDhakaDay(now);
  const [year, month] = dhakaDateKey(day).split('-').map(Number);
  return new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+06:00`);
}

function movementFinancials(
  movement: StockMovement,
  movementById: Map<string, StockMovement>,
): { revenue: Paisa; cogs: Paisa } {
  const isSale = movement.reason === 'SALE';
  const reversed = movement.reversesId ? movementById.get(movement.reversesId) : null;
  const reversesSale = movement.reason === 'CORRECTION' && reversed?.reason === 'SALE';
  if (!isSale && !reversesSale) return { revenue: 0, cogs: 0 };

  return {
    revenue: movement.unitPrice === null ? 0 : -movement.quantity * movement.unitPrice,
    cogs: -movement.quantity * movement.unitCost,
  };
}

export async function getDashboard(
  role: Role,
  now = new Date(),
  repositories: Repositories = db,
): Promise<DashboardDTO> {
  const [products, movements, users] = await Promise.all([
    repositories.products.findAll(),
    repositories.movements.findByDateRange(new Date(0), now),
    repositories.users.findAll(),
  ]);
  const unitsByProduct = new Map<string, ProductUnit[]>();
  await Promise.all(
    products.map(async (product) => {
      unitsByProduct.set(
        product.id,
        product.trackingType === 'SERIAL' ? await repositories.units.findByProduct(product.id) : [],
      );
    }),
  );

  const productById = new Map(products.map((product) => [product.id, product]));
  const movementById = new Map(movements.map((movement) => [movement.id, movement]));
  const reversedMovementIds = new Set(
    movements
      .filter((movement) => movement.reason === 'CORRECTION' && movement.reversesId)
      .map((movement) => movement.reversesId!),
  );
  const isEffectiveOperation = (movement: StockMovement) => (
    movement.reason !== 'CORRECTION' && !reversedMovementIds.has(movement.id)
  );
  const userById = new Map(users.map((user: User) => [user.id, user.name]));
  const onHand = new Map<string, number>();

  for (const product of products) {
    onHand.set(
      product.id,
      product.trackingType === 'SERIAL'
        ? (unitsByProduct.get(product.id) ?? []).filter((unit) => unit.status === 'IN_STOCK').length
        : product.quantityOnHand,
    );
  }

  const activeProducts = products.filter((product) => product.isActive);
  const row = (product: Product): DashboardProductRow => ({
    productId: product.id,
    name: product.name,
    sku: product.sku,
    onHand: onHand.get(product.id) ?? 0,
    reorderPoint: product.reorderPoint,
  });
  const lowStock = activeProducts
    .filter((product) => (onHand.get(product.id) ?? 0) > 0 && (onHand.get(product.id) ?? 0) <= product.reorderPoint)
    .map(row)
    .sort((a, b) => a.onHand - b.onHand);
  const outOfStock = activeProducts.filter((product) => (onHand.get(product.id) ?? 0) === 0);

  const cutoff30 = new Date(now.getTime() - 30 * DAY_MS);
  const cutoff60 = new Date(now.getTime() - 60 * DAY_MS);
  const recentOutboundByProduct = new Map<string, StockMovement[]>();
  for (const movement of movements) {
    if (movement.quantity < 0 && isEffectiveOperation(movement)) {
      const list = recentOutboundByProduct.get(movement.productId) ?? [];
      list.push(movement);
      recentOutboundByProduct.set(movement.productId, list);
    }
  }

  const deadStock = activeProducts
    .filter((product) => (onHand.get(product.id) ?? 0) > 0)
    .map((product) => {
      const latest = (recentOutboundByProduct.get(product.id) ?? []).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )[0];
      const lastOutAt = latest?.createdAt ?? null;
      const inactiveDays = lastOutAt
        ? Math.floor((now.getTime() - new Date(lastOutAt).getTime()) / DAY_MS)
        : null;
      return { ...row(product), lastOutAt, inactiveDays };
    })
    .filter((item) => item.lastOutAt === null || new Date(item.lastOutAt) <= cutoff60)
    .sort((a, b) => (b.inactiveDays ?? Number.MAX_SAFE_INTEGER) - (a.inactiveDays ?? Number.MAX_SAFE_INTEGER));

  const recentActivity = [...movements]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)
    .map((movement): DashboardActivity => {
      const product = productById.get(movement.productId);
      return {
        id: movement.id,
        productId: movement.productId,
        productName: product?.name ?? 'Unknown product',
        sku: product?.sku ?? '—',
        reason: movement.reason,
        quantity: movement.quantity,
        actorId: movement.actorId,
        actorName: userById.get(movement.actorId ?? '') ?? (movement.actorId ? 'Authenticated user' : 'System'),
        createdAt: movement.createdAt,
      };
    });

  const warrantyEnd = new Date(now.getTime() + 30 * DAY_MS);
  const expiringWarranties = products
    .flatMap((product) =>
      (unitsByProduct.get(product.id) ?? []).map((unit) => ({ product, unit })),
    )
    .filter(({ unit }) => {
      if (!unit.warrantyExpiresAt || unit.status === 'VOID') return false;
      const expiry = new Date(unit.warrantyExpiresAt);
      return expiry >= now && expiry <= warrantyEnd;
    })
    .map(({ product, unit }): WarrantyAlert => ({
      unitId: unit.id,
      serialNo: unit.serialNo,
      productId: product.id,
      productName: product.name,
      status: unit.status,
      warrantyExpiresAt: unit.warrantyExpiresAt!,
      daysRemaining: Math.ceil((new Date(unit.warrantyExpiresAt!).getTime() - now.getTime()) / DAY_MS),
    }))
    .sort((a, b) => a.warrantyExpiresAt.localeCompare(b.warrantyExpiresAt));

  const movementCount30 = new Map<string, number>();
  for (const movement of movements) {
    if (new Date(movement.createdAt) < cutoff30 || movement.quantity >= 0 || !isEffectiveOperation(movement)) continue;
    movementCount30.set(
      movement.productId,
      (movementCount30.get(movement.productId) ?? 0) + Math.abs(movement.quantity),
    );
  }
  const movers = activeProducts
    .filter((product) => (onHand.get(product.id) ?? 0) > 0 || (movementCount30.get(product.id) ?? 0) > 0)
    .map((product): MoverRow => ({ ...row(product), movedLast30Days: movementCount30.get(product.id) ?? 0 }));
  const topMovers = [...movers].sort((a, b) => b.movedLast30Days - a.movedLast30Days).slice(0, 5);
  const slowMovers = [...movers]
    .filter((item) => item.onHand > 0)
    .sort((a, b) => a.movedLast30Days - b.movedLast30Days || b.onHand - a.onHand)
    .slice(0, 5);

  const dayStart = startOfDhakaDay(now);
  const dayKeys = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(dayStart.getTime() - (29 - index) * DAY_MS);
    return dhakaDateKey(date);
  });
  const operations = new Map(dayKeys.map((date) => [date, { stockIn: 0, stockOut: 0 }]));
  const financials = new Map(dayKeys.map((date) => [date, { revenue: 0, margin: 0 }]));

  for (const movement of movements) {
    const key = dhakaDateKey(new Date(movement.createdAt));
    const operation = operations.get(key);
    if (operation && isEffectiveOperation(movement)) {
      if (movement.quantity > 0) operation.stockIn += movement.quantity;
      if (movement.quantity < 0) operation.stockOut += Math.abs(movement.quantity);
    }
    const financial = financials.get(key);
    if (financial) {
      const values = movementFinancials(movement, movementById);
      financial.revenue += values.revenue;
      financial.margin += values.revenue - values.cogs;
    }
  }

  const common: DashboardCommon = {
    generatedAt: now.toISOString(),
    totalUnits: [...onHand.values()].reduce((sum, quantity) => sum + quantity, 0),
    distinctSkus: activeProducts.filter((product) => (onHand.get(product.id) ?? 0) > 0).length,
    lowStockCount: lowStock.length,
    outOfStockCount: outOfStock.length,
    lowStock: [...lowStock, ...outOfStock.map(row)].slice(0, 10),
    deadStock: deadStock.slice(0, 10),
    recentActivity,
    expiringWarranties: expiringWarranties.slice(0, 10),
    topMovers,
    slowMovers,
    dailyOperations: dayKeys.map((date) => ({ date, ...operations.get(date)! })),
  };

  if (!canSeeCosts(role)) return { ...common, canSeeFinancials: false };

  let stockValueAtCost = 0;
  let stockValueAtRetail = 0;
  for (const product of products) {
    const quantity = onHand.get(product.id) ?? 0;
    if (product.trackingType === 'SERIAL') {
      const inStockUnits = (unitsByProduct.get(product.id) ?? [])
        .filter((unit) => unit.status === 'IN_STOCK');
      stockValueAtCost += inStockUnits.reduce((sum, unit) => sum + unit.costPrice, 0);
      stockValueAtRetail += inStockUnits.reduce(
        (sum, unit) => sum + (
          unit.askingPrice
          ?? (unit.usedGrade === 'REFURBISHED' ? unit.costPrice : product.defaultSalePrice)
        ),
        0,
      );
    } else {
      stockValueAtCost += quantity * product.avgCostPrice;
      stockValueAtRetail += quantity * product.defaultSalePrice;
    }
  }

  const monthStart = monthStartDhaka(now);
  let monthRevenue = 0;
  let monthCogs = 0;
  for (const movement of movements) {
    if (new Date(movement.createdAt) < monthStart) continue;
    const values = movementFinancials(movement, movementById);
    monthRevenue += values.revenue;
    monthCogs += values.cogs;
  }
  const monthExpenses = await repositories.operatingExpenses.findAll({
    from: monthStart,
    to: now,
    status: 'ACTIVE',
  });
  const monthOperatingExpenses = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const monthShrinkage = movements
    .filter((movement) => new Date(movement.createdAt) >= monthStart
      && isEffectiveOperation(movement)
      && (movement.reason === 'DAMAGE' || movement.reason === 'LOSS'))
    .reduce((sum, movement) => sum + Math.abs(movement.quantity) * movement.unitCost, 0);
  const monthGrossProfit = monthRevenue - monthCogs;

  const rangeStart = new Date(`${dayKeys[0]}T00:00:00+06:00`);
  const stockValueDeltaByDay = new Map(dayKeys.map((date) => [date, 0]));
  let runningStockValue = movements
    .filter((movement) => new Date(movement.createdAt) < rangeStart)
    .reduce((sum, movement) => sum + movement.quantity * movement.unitCost, 0);
  for (const movement of movements) {
    const key = dhakaDateKey(new Date(movement.createdAt));
    if (stockValueDeltaByDay.has(key)) {
      stockValueDeltaByDay.set(
        key,
        stockValueDeltaByDay.get(key)! + movement.quantity * movement.unitCost,
      );
    }
  }
  const dailyFinancials = dayKeys.map((date): DailyFinancialPoint => {
    runningStockValue += stockValueDeltaByDay.get(date)!;
    const values = financials.get(date)!;
    return { date, stockValue: runningStockValue, revenue: values.revenue, margin: values.margin };
  });

  return {
    ...common,
    canSeeFinancials: true,
    stockValueAtCost,
    stockValueAtRetail,
    potentialMargin: stockValueAtRetail - stockValueAtCost,
    monthRevenue,
    monthCogs,
    monthGrossProfit,
    monthOperatingExpenses,
    monthShrinkage,
    monthOperatingProfit: monthGrossProfit - monthOperatingExpenses - monthShrinkage,
    dailyFinancials,
  };
}
