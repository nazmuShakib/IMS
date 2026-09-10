import type {
  Brand,
  Category,
  Product,
  ProductUnit,
  StockMovement,
  Supplier,
  User,
} from '@/domain/types';
import { calculateReport } from '@/lib/report-calculations';
import { finishReport } from '@/lib/report-results';
import type { ReportFilters } from '@/lib/report-query';
import type { ReportRepository } from '../types';
import { readAll } from './store';

async function query(filters: ReportFilters, now: Date, exporting = false) {
  const [products, movements, units, categories, brands, suppliers, users] = await Promise.all([
    readAll<Product>('products'),
    filters.report === 'valuation' ? [] : readAll<StockMovement>('stock-movements'),
    ['valuation', 'aging'].includes(filters.report) ? readAll<ProductUnit>('product-units') : [],
    readAll<Category>('categories'),
    readAll<Brand>('brands'),
    filters.report === 'purchases' ? readAll<Supplier>('suppliers') : [],
    filters.report === 'movements' ? readAll<User>('users') : [],
  ]);
  return finishReport(
    calculateReport(
      {
        products,
        movements,
        units,
        productById: new Map(products.map((p) => [p.id, p])),
        categoryNames: new Map(categories.map((p) => [p.id, p.name])),
        brandNames: new Map(brands.map((p) => [p.id, p.name])),
        supplierNames: new Map(suppliers.map((p) => [p.id, p.name])),
        actorNames: new Map(users.map((p) => [p.id, p.name])),
      },
      filters,
      now,
    ),
    filters,
    exporting,
  );
}
export const jsonReports: ReportRepository = {
  findPage: (filters, now) => query(filters, now),
  export: (filters, now) => query(filters, now, true),
  async actors() {
    const [users, movements] = await Promise.all([
      readAll<User>('users'),
      readAll<StockMovement>('stock-movements'),
    ]);
    const ids = new Set(movements.map((m) => m.actorId));
    return users
      .filter((u) => ids.has(u.id))
      .map(({ id, name }) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  async products(q) {
    return (await readAll<Product>('products'))
      .filter((p) => !q || `${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .slice(0, 20)
      .map(({ id, name, sku }) => ({ id, name, sku }));
  },
};
