import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { createRepositories } from '@/repositories/prisma';
import { jsonRepositories } from '@/repositories/json';
import { createExpense, updateExpense, voidExpense, withExpenseAudit, updateExpenseCategory } from '@/services/expenses';
import { parseExpenseQuery } from '@/lib/expense-query';
import { expenseCategories, expenseFixtures } from './expense-fixtures';
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
const memory = vi.hoisted(() => new Map<string, unknown[]>());
vi.mock('@/repositories/json/store', async original => ({ ...await original<typeof import('@/repositories/json/store')>(), readAll: async (key: string) => memory.get(key) ?? [] }));
const url = process.env.TEST_EXPENSE_DATABASE_URL;
describe.skipIf(!url)('Operating expenses on disposable PostgreSQL', () => {
  const schema = `expense_fixture_${randomUUID().replaceAll('-', '')}`;
  const connection = new URL(url ?? 'postgresql://unused'); connection.searchParams.set('schema', schema);
  const admin = new PrismaClient({ datasources: { db: { url: url ?? 'postgresql://unused' } } });
  const client = new PrismaClient({ datasources: { db: { url: connection.toString() } } });
  const repositories = createRepositories(client, (fn, options) => client.$transaction(tx => fn(createRepositories(tx)), { ...options, timeout: 15000 }));
  const rows = expenseFixtures();
  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await client.$executeRawUnsafe('CREATE TYPE "PaymentMethod" AS ENUM (\'CASH\',\'MOBILE_BANKING\',\'MIXED\',\'BANK_TRANSFER\',\'CARD\',\'OTHER\')');
    await client.$executeRawUnsafe('CREATE TYPE "OperatingExpenseStatus" AS ENUM (\'ACTIVE\',\'VOIDED\')');
    await client.$executeRawUnsafe('CREATE TABLE users (id text PRIMARY KEY, name text)');
    await client.$executeRawUnsafe('CREATE TABLE expense_categories (id text PRIMARY KEY, name text UNIQUE, "isActive" boolean, "createdAt" timestamp, "updatedAt" timestamp)');
    await client.$executeRawUnsafe('CREATE TABLE operating_expenses (id text PRIMARY KEY, "expenseNumber" text UNIQUE, "expenseDate" timestamp, "categoryId" text REFERENCES expense_categories(id), description text, amount integer, "paidTo" text, "paymentMethod" "PaymentMethod", reference text, note text, status "OperatingExpenseStatus", "recordedById" text REFERENCES users(id), "updatedById" text REFERENCES users(id), "voidedById" text, "voidedAt" timestamp, "voidReason" text, "createdAt" timestamp, "updatedAt" timestamp)');
    await client.$executeRawUnsafe('CREATE TABLE audit_logs (id text PRIMARY KEY, "actorId" text REFERENCES users(id), action text, entity text, "entityId" text, before jsonb, after jsonb, ip text, "createdAt" timestamp)');
    await client.$executeRawUnsafe('CREATE TABLE document_sequences (key text PRIMARY KEY, value integer)');
    await client.$executeRawUnsafe("INSERT INTO users VALUES ('user1','Manager')");
    await client.expenseCategory.createMany({ data: expenseCategories.map(c => ({ ...c, createdAt: new Date(c.createdAt), updatedAt: new Date(c.updatedAt) })) });
    await client.operatingExpense.createMany({ data: rows.map(r => ({ ...r, expenseDate: new Date(r.expenseDate), createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt), voidedAt: null })) });
    await client.documentSequence.create({ data: { key: `EXP:${new Date().getFullYear()}`, value: 10000 } });
    memory.set('operating-expenses', rows); memory.set('expense-categories', expenseCategories);
  }, 30000);
  afterAll(async () => { await client.$disconnect(); await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect(); });
  it.each(['newest', 'oldest', 'amount-desc', 'amount-asc'])('matches JSON filters, totals, full exports and page boundaries for %s', async order => {
    for (const filter of [{}, { categoryId: 'old' }, { status: 'VOIDED' }, { query: 'SHOP' }, { from: '2026-09-10', to: '2026-09-10' }, { from: '2026-09-11' }, { minAmount: '4.00', maxAmount: '8' }, { query: '%' }]) {
      const query = parseExpenseQuery({ ...filter, order, page: '999', pageSize: '100' });
      expect(await repositories.operatingExpenses.findPage(query)).toEqual(await jsonRepositories.operatingExpenses.findPage(query));
      expect(await repositories.operatingExpenses.findForExport(query)).toEqual(await jsonRepositories.operatingExpenses.findForExport(query));
    }
  });
  const input = { expenseDate: '2026-09-10', categoryId: 'rent', description: 'New rent', amount: '12.50', paidTo: '', paymentMethod: 'CASH', reference: '', note: '', actorId: 'user1' };
  it('rolls back expense creation and numbering when audit insertion fails', async () => {
    const before = await client.operatingExpense.count(), seq = await client.documentSequence.findMany();
    await expect(withExpenseAudit({ actorId: 'missing-user', ip: null, action: 'operating_expense.create', entity: 'OperatingExpense' }, tx => createExpense(input, tx), repositories)).rejects.toThrow();
    expect(await client.operatingExpense.count()).toBe(before); expect(await client.documentSequence.findMany()).toEqual(seq); expect(await client.auditLog.count()).toBe(0);
  });
  it('rolls back edits, voids and category changes when their audit insert fails', async () => {
    const row = rows.find(r => r.status === 'ACTIVE')!;
    for (const mutation of [(tx: typeof repositories) => updateExpense({ ...input, expenseId: row.id }, tx), (tx: typeof repositories) => voidExpense({ expenseId: row.id, actorId: 'user1', reason: 'Duplicate record', confirmed: true }, tx)]) {
      await expect(withExpenseAudit({ actorId: 'missing-user', ip: null, action: 'test', entity: 'OperatingExpense', entityId: row.id }, mutation, repositories)).rejects.toThrow();
      expect(await repositories.operatingExpenses.findById(row.id)).toEqual(row);
    }
    await expect(withExpenseAudit({ actorId: 'missing-user', ip: null, action: 'test', entity: 'ExpenseCategory', entityId: 'rent' }, tx => updateExpenseCategory({ categoryId: 'rent', name: 'Changed category', isActive: false }, tx), repositories)).rejects.toThrow();
    expect((await repositories.expenseCategories.findById('rent'))?.name).toBe(expenseCategories[0]!.name);
  });
  it('retains before/after snapshots and prevents repeated or concurrent voids', async () => {
    const row = rows.find(r => r.status === 'ACTIVE')!;
    const context = { actorId: 'user1', ip: '127.0.0.1', action: 'operating_expense.void', entity: 'OperatingExpense' as const, entityId: row.id };
    const attempt = () => withExpenseAudit(context, tx => voidExpense({ expenseId: row.id, actorId: 'user1', reason: 'Duplicate record', confirmed: true }, tx), repositories);
    const results = await Promise.allSettled([attempt(), attempt()]); expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const logs = await repositories.auditLogs.findByEntity('OperatingExpense', row.id); expect(logs).toHaveLength(1); expect(logs[0]).toMatchObject({ ip: '127.0.0.1', before: { status: 'ACTIVE' }, after: { status: 'VOIDED' } });
    await expect(updateExpense({ ...input, expenseId: row.id }, repositories)).rejects.toThrow('voided');
  });
});
