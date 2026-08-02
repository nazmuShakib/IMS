'use client';

import type { Role } from '@/domain/types';
import { NavLink } from '@/components/shell/NavLink';
import { useI18n } from '@/components/i18n/I18nProvider';

export function NavigationLinks({
  role,
  onNavigate,
}: {
  role: Role;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const catalog = [
    { href: '/products', label: t('common.products') },
    { href: '/categories', label: t('nav.categories') },
    { href: '/brands', label: t('nav.brands') },
    { href: '/suppliers', label: t('nav.suppliers') },
  ];
  const stock = [
    { href: '/stock/in', label: t('nav.receiveStock') },
    { href: '/stock/labels', label: t('nav.printLabels') },
    { href: '/stock/out', label: t('nav.removeStock') },
    { href: '/stock/movements', label: t('nav.movementLedger') },
  ];
  return (
    <>
      <p className="eyebrow px-2 pb-1.5">{t('shell.overview')}</p>
      <NavLink href="/" onClick={onNavigate}>{t('nav.dashboard')}</NavLink>

      <p className="eyebrow mt-5 px-2 pb-1.5">{t('shell.sales')}</p>
      <NavLink href="/checkout" onClick={onNavigate}>{t('nav.checkout')}</NavLink>
      <NavLink href="/invoices" onClick={onNavigate}>{t('nav.invoices')}</NavLink>
      <NavLink href="/customers" onClick={onNavigate}>{t('nav.customers')}</NavLink>

      <p className="eyebrow mt-5 px-2 pb-1.5">{t('shell.stock')}</p>
      {stock.map((item) => (
        <NavLink key={item.href} href={item.href} onClick={onNavigate}>
          {item.label}
        </NavLink>
      ))}
      {role !== 'STAFF' && (
        <>
          <NavLink href="/stock/reconcile" onClick={onNavigate}>{t('nav.reconciliation')}</NavLink>
          <p className="eyebrow mt-5 px-2 pb-1.5">{t('shell.analysis')}</p>
          <NavLink href="/reports" onClick={onNavigate}>{t('nav.reports')}</NavLink>
        </>
      )}

      <p className="eyebrow mt-5 px-2 pb-1.5">{t('shell.afterSales')}</p>
      <NavLink href="/warranty" onClick={onNavigate}>{t('nav.warrantyClaims')}</NavLink>

      <p className="eyebrow mt-5 px-2 pb-1.5">{t('shell.catalog')}</p>
      {catalog.map((item) => (
        <NavLink key={item.href} href={item.href} onClick={onNavigate}>
          {item.label}
        </NavLink>
      ))}

      {role === 'ADMIN' && (
        <>
          <p className="eyebrow mt-5 px-2 pb-1.5">{t('shell.administration')}</p>
          <NavLink href="/users" onClick={onNavigate}>{t('nav.users')}</NavLink>
          <NavLink href="/audit" onClick={onNavigate}>{t('nav.auditLog')}</NavLink>
        </>
      )}
    </>
  );
}
