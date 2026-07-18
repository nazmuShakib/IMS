import Link from 'next/link';
import { getSession } from '@/lib/session';
import { Badge } from '@/components/ui';
import { SignOutControl } from '@/components/auth/SignOutControl';
import { CommandPalette } from '@/components/search/CommandPalette';
import { NavLink } from '@/components/shell/NavLink';

export const dynamic = 'force-dynamic'; // JSON repos read from disk per request

const CATALOG = [
  { href: '/products', label: 'Products' },
  { href: '/categories', label: 'Categories' },
  { href: '/brands', label: 'Brands' },
  { href: '/suppliers', label: 'Suppliers' },
];

const STOCK = [
  { href: '/stock/in', label: 'Receive stock' },
  { href: '/stock/out', label: 'Stock out' },
  { href: '/stock/movements', label: 'Movement ledger' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await getSession();

  return (
    <div className="flex min-h-screen">
      {/* --- Sidebar ---------------------------------------------------- */}
      <aside className="hidden w-52 shrink-0 flex-col border-r border-rule bg-card md:flex">
        <div className="border-b border-rule px-4 py-4">
          <Link href="/" className="block">
            <span className="text-[13px] font-semibold tracking-[-0.01em]">Inventory</span>
            <span className="eyebrow mt-0.5 block">Electronics Shop</span>
          </Link>
        </div>

        <nav className="flex-1 px-2 py-3">
          <p className="eyebrow px-2 pb-1.5">Overview</p>
          <NavLink href="/">Dashboard</NavLink>

          <p className="eyebrow mt-5 px-2 pb-1.5">Stock</p>
          {STOCK.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
          {role !== 'STAFF' && (
            <>
              <NavLink href="/stock/reconcile">Reconciliation</NavLink>
              <p className="eyebrow mt-5 px-2 pb-1.5">Analysis</p>
              <NavLink href="/reports">Reports</NavLink>
            </>
          )}

          <p className="eyebrow mt-5 px-2 pb-1.5">Catalog</p>
          {CATALOG.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}

          {role === 'ADMIN' && (
            <>
              <p className="eyebrow mt-5 px-2 pb-1.5">Administration</p>
              <NavLink href="/users">Users</NavLink>
              <NavLink href="/audit">Audit log</NavLink>
            </>
          )}
        </nav>

        <div className="border-t border-rule px-4 py-3">
          <p className="truncate text-[12px] font-medium">{user.name}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <Badge tone="signal">{role}</Badge>
            <span className="text-[10px] text-graphite">authenticated</span>
          </div>
          <SignOutControl />
        </div>
      </aside>

      {/* --- Main ------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-rule bg-card px-4">
          <CommandPalette />
        </header>

        <main className="flex-1 p-5 lg:p-7">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
