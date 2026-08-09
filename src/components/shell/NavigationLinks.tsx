'use client';

import type { Role } from '@/domain/types';
import { NavLink } from '@/components/shell/NavLink';
import { useI18n } from '@/components/i18n/I18nProvider';
import {
  ArrowLeftRight,
  BadgeCheck,
  BarChart3,
  ClipboardCheck,
  FolderTree,
  LayoutDashboard,
  Package,
  PackageMinus,
  PackagePlus,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Tags,
  Truck,
  Undo2,
  UserCog,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

export function NavigationLinks({
  role,
  onNavigate,
  desktop = false,
}: {
  role: Role;
  onNavigate?: () => void;
  desktop?: boolean;
}) {
  const { t } = useI18n();
  const icon = (Icon: LucideIcon) => (
    <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />
  );
  const catalog = [
    { href: '/products', label: t('common.products'), icon: Package },
    { href: '/categories', label: t('nav.categories'), icon: FolderTree },
    { href: '/brands', label: t('nav.brands'), icon: BadgeCheck },
    { href: '/suppliers', label: t('nav.suppliers'), icon: Truck },
  ];
  const stock = [
    { href: '/stock/in', label: t('nav.receiveStock'), icon: PackagePlus },
    { href: '/stock/labels', label: t('nav.printLabels'), icon: Tags },
    { href: '/stock/out', label: t('nav.removeStock'), icon: PackageMinus },
    { href: '/stock/movements', label: t('nav.movementLedger'), icon: ArrowLeftRight, tooltip: desktop ? t('navHelp.movementLedger') : undefined },
  ];
  return (
    <div className={desktop ? 'desktop-navigation' : undefined}>
      <p className="eyebrow px-2 pb-1.5">{t('shell.overview')}</p>
      <NavLink href="/" onClick={onNavigate} icon={icon(LayoutDashboard)}>{t('nav.dashboard')}</NavLink>

      <p className="eyebrow mt-5 px-2 pb-1.5">{t('shell.sales')}</p>
      <NavLink href="/checkout" onClick={onNavigate} icon={icon(ShoppingCart)}>{t('nav.checkout')}</NavLink>
      <NavLink href="/invoices" onClick={onNavigate} icon={icon(ReceiptText)}>{t('nav.invoices')}</NavLink>
      <NavLink href="/customers" onClick={onNavigate} icon={icon(UsersRound)}>{t('nav.customers')}</NavLink>

      <p className="eyebrow mt-5 px-2 pb-1.5">{t('shell.stock')}</p>
      {stock.map((item) => (
        <NavLink key={item.href} href={item.href} onClick={onNavigate} icon={icon(item.icon)} tooltip={item.tooltip}>
          {item.label}
        </NavLink>
      ))}
      {role !== 'STAFF' && (
        <>
          <NavLink href="/stock/used-intake" onClick={onNavigate} icon={icon(Smartphone)}>{t('nav.usedPhoneIntake')}</NavLink>
          <NavLink href="/stock/reconcile" onClick={onNavigate} icon={icon(ClipboardCheck)} tooltip={desktop ? t('navHelp.reconciliation') : undefined}>{t('nav.reconciliation')}</NavLink>
          <p className="eyebrow mt-5 px-2 pb-1.5">{t('shell.analysis')}</p>
          <NavLink href="/reports" onClick={onNavigate} icon={icon(BarChart3)} tooltip={desktop ? t('navHelp.reports') : undefined}>{t('nav.reports')}</NavLink>
        </>
      )}

      <p className="eyebrow mt-5 px-2 pb-1.5">{t('shell.afterSales')}</p>
      <NavLink href="/warranty" onClick={onNavigate} icon={icon(ShieldCheck)} tooltip={desktop ? t('navHelp.warrantyClaims') : undefined}>{t('nav.warrantyClaims')}</NavLink>

      <p className="eyebrow mt-5 px-2 pb-1.5">{t('shell.catalog')}</p>
      {catalog.map((item) => (
        <NavLink key={item.href} href={item.href} exact={item.href === '/suppliers'} onClick={onNavigate} icon={icon(item.icon)}>
          {item.label}
        </NavLink>
      ))}
      {role !== 'STAFF' && <NavLink href="/suppliers/returns" onClick={onNavigate} icon={icon(Undo2)}>{t('nav.supplierReturns')}</NavLink>}

      {role === 'ADMIN' && (
        <>
          <p className="eyebrow mt-5 px-2 pb-1.5">{t('shell.administration')}</p>
          <NavLink href="/users" onClick={onNavigate} icon={icon(UserCog)}>{t('nav.users')}</NavLink>
          <NavLink href="/audit" onClick={onNavigate} icon={icon(ScrollText)} tooltip={desktop ? t('navHelp.auditLog') : undefined} tooltipPlacement="top">{t('nav.auditLog')}</NavLink>
        </>
      )}

      <p className="eyebrow mt-5 px-2 pb-1.5">{t('settings.title')}</p>
      <NavLink href="/settings" onClick={onNavigate} icon={icon(Settings)}>{t('nav.settings')}</NavLink>
    </div>
  );
}
