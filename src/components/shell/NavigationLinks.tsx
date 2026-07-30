import type { Role } from '@/domain/types';
import { NavLink } from '@/components/shell/NavLink';

const CATALOG = [
  { href: '/products', label: 'Products' },
  { href: '/categories', label: 'Categories' },
  { href: '/brands', label: 'Brands' },
  { href: '/suppliers', label: 'Suppliers' },
];

const STOCK = [
  { href: '/stock/in', label: 'Receive stock' },
  { href: '/stock/labels', label: 'Print labels' },
  { href: '/stock/out', label: 'Inventory removal' },
  { href: '/stock/movements', label: 'Movement ledger' },
];

export function NavigationLinks({
  role,
  onNavigate,
}: {
  role: Role;
  onNavigate?: () => void;
}) {
  return (
    <>
      <p className="eyebrow px-2 pb-1.5">Overview</p>
      <NavLink href="/" onClick={onNavigate}>Dashboard</NavLink>

      <p className="eyebrow mt-5 px-2 pb-1.5">Sales</p>
      <NavLink href="/checkout" onClick={onNavigate}>Checkout</NavLink>
      <NavLink href="/invoices" onClick={onNavigate}>Invoices</NavLink>
      <NavLink href="/customers" onClick={onNavigate}>Customers</NavLink>

      <p className="eyebrow mt-5 px-2 pb-1.5">Stock</p>
      {STOCK.map((item) => (
        <NavLink key={item.href} href={item.href} onClick={onNavigate}>
          {item.label}
        </NavLink>
      ))}
      {role !== 'STAFF' && (
        <>
          <NavLink href="/stock/reconcile" onClick={onNavigate}>Reconciliation</NavLink>
          <p className="eyebrow mt-5 px-2 pb-1.5">Analysis</p>
          <NavLink href="/reports" onClick={onNavigate}>Reports</NavLink>
        </>
      )}

      <p className="eyebrow mt-5 px-2 pb-1.5">After-sales</p>
      <NavLink href="/warranty" onClick={onNavigate}>Warranty / RMA</NavLink>

      <p className="eyebrow mt-5 px-2 pb-1.5">Catalog</p>
      {CATALOG.map((item) => (
        <NavLink key={item.href} href={item.href} onClick={onNavigate}>
          {item.label}
        </NavLink>
      ))}

      {role === 'ADMIN' && (
        <>
          <p className="eyebrow mt-5 px-2 pb-1.5">Administration</p>
          <NavLink href="/users" onClick={onNavigate}>Users</NavLink>
          <NavLink href="/audit" onClick={onNavigate}>Audit log</NavLink>
        </>
      )}
    </>
  );
}
