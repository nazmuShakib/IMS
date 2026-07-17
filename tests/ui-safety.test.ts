import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('bounded data tables', () => {
  it('provides a keyboard-focusable, internally scrolling table viewport', () => {
    const ui = source('src/components/ui/index.tsx');
    expect(ui).toContain('max-h-[min(65vh,42rem)]');
    expect(ui).toContain('overflow-auto');
    expect(ui).toContain('tabIndex={0}');
  });

  it.each([
    'src/app/(dashboard)/audit/page.tsx',
    'src/app/(dashboard)/users/page.tsx',
    'src/app/(dashboard)/products/page.tsx',
    'src/app/(dashboard)/stock/movements/page.tsx',
    'src/app/(dashboard)/products/[id]/page.tsx',
    'src/app/(dashboard)/stock/reconcile/page.tsx',
  ])('bounds the growing table in %s', (file) => {
    const page = source(file);
    expect(page).toContain('<TableViewport>');
    expect(page).toContain('sticky top-0');
  });
});

describe('sign-out confirmation', () => {
  it('does not submit logout directly from the dashboard sidebar', () => {
    const layout = source('src/app/(dashboard)/layout.tsx');
    expect(layout).toContain('<SignOutControl />');
    expect(layout).not.toContain('action={logoutAction}');
  });

  it('requires an explicit confirmation action and supports cancellation', () => {
    const control = source('src/components/auth/SignOutControl.tsx');
    expect(control).toContain('role="alertdialog"');
    expect(control).toContain('action={logoutAction}');
    expect(control).toContain('setOpen(false)');
    expect(control).toContain("event.key === 'Escape'");
  });
});
