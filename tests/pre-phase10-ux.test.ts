import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');

describe('pre-Phase 10 catalog and ledger UX', () => {
  it('filters suppliers locally and preserves history through reversible removal', () => {
    const register = source('src/components/suppliers/SupplierRegister.tsx');
    const editor = source('src/components/suppliers/SupplierEditor.tsx');
    const actions = source('src/actions/catalog.ts');
    expect(register).toContain('useMemo');
    expect(register).toContain('supplier.phone');
    expect(register).toContain('supplier.email');
    expect(register).toContain('supplier.address');
    expect(register).toContain("order === 'newest'");
    expect(editor).toContain('<Pencil');
    expect(editor).toContain('<Trash2');
    expect(editor).toContain('<RotateCcw');
    expect(actions).toContain('export async function setSupplierActive');
    expect(actions).toContain("action: active ? 'supplier.restore' : 'supplier.archive'");
    expect(actions).not.toContain('db.suppliers.delete');
  });

  // Ledger control stability and navigation are exercised in movement-ui.test.tsx.

  // Product filters and dead-stock behavior are covered by catalog-pagination.test.ts
  // and real SQL parity checks in catalog-postgres.test.ts.
});
