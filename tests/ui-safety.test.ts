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
    expect(control).toContain('createPortal');
    expect(control).toContain('document.body');
    expect(control).toContain('z-[100]');
    expect(control).toContain('window.innerWidth - document.documentElement.clientWidth');
    expect(control).toContain('document.body.style.paddingRight');
    expect(source('src/app/globals.css')).not.toContain('scrollbar-gutter: stable');
  });
});

describe('route loading feedback', () => {
  it.each([
    ['src/app/(dashboard)/checkout/loading.tsx', 'Loading checkout…'],
    ['src/app/(dashboard)/products/loading.tsx', 'Loading products…'],
    ['src/app/(dashboard)/categories/loading.tsx', 'Loading categories…'],
    ['src/app/(dashboard)/brands/loading.tsx', 'Loading brands…'],
    ['src/app/(dashboard)/suppliers/loading.tsx', 'Loading suppliers…'],
    ['src/app/(dashboard)/users/loading.tsx', 'Loading users…'],
    ['src/app/(dashboard)/audit/loading.tsx', 'Loading audit log…'],
  ])('uses a page-specific message in %s', (file, label) => {
    expect(source(file)).toContain(label);
  });

  it('centres full-page feedback in the available dashboard body', () => {
    const loading = source('src/components/shell/LoadingScreen.tsx');
    expect(loading).toContain('min-h-[calc(100dvh-6rem)]');
    expect(loading).toContain('lg:min-h-[calc(100dvh-7rem)]');
  });
});

describe('responsive navigation', () => {
  it('provides the role-aware sidebar destinations through a mobile drawer', () => {
    const layout = source('src/app/(dashboard)/layout.tsx');
    const mobile = source('src/components/shell/MobileNavigation.tsx');
    const links = source('src/components/shell/NavigationLinks.tsx');
    expect(layout).toContain('<MobileNavigation');
    expect(layout).toContain('<NavigationLinks role={role} />');
    expect(mobile).toContain("aria-label={t('nav.openMenu')}");
    expect(mobile).toContain('role="dialog"');
    expect(mobile).toContain('md:hidden');
    expect(mobile).toContain('createPortal');
    expect(mobile).toContain('<NavigationLinks role={role}');
    expect(links).toContain("role !== 'STAFF'");
    expect(links).toContain("role === 'ADMIN'");
  });
});

describe('plain-language terminology', () => {
  it('explains technical terms while preserving the requested navigation names', () => {
    const ui = source('src/components/ui/index.tsx');
    const navigation = source('src/components/shell/NavigationLinks.tsx');
    const products = source('src/app/(dashboard)/products/page.tsx');
    expect(ui).toContain('role="tooltip"');
    expect(products).toContain("t('term.productCode')");
    expect(products).toContain('placement="bottom"');
    expect(products).toContain("p.trackingType === 'SERIAL' ? t('term.serial') : t('term.bulkCount')");
    expect(navigation).toContain("t('nav.removeStock')");
    expect(navigation).toContain("t('nav.warrantyClaims')");
    expect(navigation).toContain("t('nav.movementLedger')");
    expect(navigation).toContain("t('nav.reconciliation')");
  });
});
