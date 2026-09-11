import { db } from '@/repositories';
import { getSession } from '@/lib/session';
import { MovementWorkspace } from '@/components/stock/MovementWorkspace';
import { MovementQueryError, movementFilters, movementPageForRole, parseMovementQuery, type MovementPage } from '@/lib/movement-query';
import type { RawParams } from '@/lib/catalog-query';
import type { MessageKey } from '@/lib/i18n/messages';

export const dynamic = 'force-dynamic';

export default async function MovementsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const { role } = await getSession(), raw = await searchParams;
  let query = parseMovementQuery({}), initialErrors: Record<string, MessageKey> = {};
  try { query = parseMovementQuery(raw); }
  catch (error) { if (error instanceof MovementQueryError) initialErrors = error.details; else throw error; }
  const invalid = Object.keys(initialErrors).length > 0;
  const empty: MovementPage = { ...query, rows: [], totalCount: 0, ledgerCount: 0, pageCount: 1 };
  const [result, products, users] = await Promise.all([
    invalid ? Promise.resolve(empty) : db.movements.findPage(query), db.products.findAll(), db.users.findAll(),
  ]);
  return <MovementWorkspace role={role} query={query} result={movementPageForRole(result, role)}
    products={products.map(({ id, name, sku }) => ({ id, name, sku }))} users={users.map(({ id, name }) => ({ id, name }))}
    initialErrors={initialErrors} invalidValues={invalid ? movementFilters(raw) : undefined} />;
}
