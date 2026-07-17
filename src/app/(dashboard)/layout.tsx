import Link from 'next/link';
import { getSession } from '@/lib/session';
import { Badge } from '@/components/ui';
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
  { href: '/stock/reconcile', label: 'Reconciliation' },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await getSession();

  return (
    <div className="flex min-h-screen">
      {/* --- Sidebar ---------------------------------------------------- */}
      <aside className="hidden w-52 shrink-0 flex-col border-r border-rule bg-card md:flex">
        <div className="border-b border-rule px-4 py-4">
          <Link href="/products" className="block">
            <span className="text-[13px] font-semibold tracking-[-0.01em]">Inventory</span>
            <span className="eyebrow mt-0.5 block">Electronics Shop</span>
          </Link>
        </div>

        <nav className="flex-1 px-2 py-3">
          <p className="eyebrow px-2 pb-1.5">Stock</p>
          {STOCK.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}

          <p className="eyebrow mt-5 px-2 pb-1.5">Catalog</p>
          {CATALOG.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}

          <p className="eyebrow mt-5 px-2 pb-1.5">Coming next</p>
          {[
            ['Dashboard', 'Phase 4'],
            ['Reports', 'Phase 5'],
          ].map(([label, phase]) => (
            <span
              key={label}
              className="flex items-center justify-between rounded-[3px] px-2 py-1.5 text-[13px] text-graphite/50"
            >
              {label}
              <span className="text-[10px]">{phase}</span>
            </span>
          ))}
        </nav>

        <div className="border-t border-rule px-4 py-3">
          <p className="truncate text-[12px] font-medium">{user.name}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <Badge tone="signal">{role}</Badge>
            <span className="text-[10px] text-graphite">stub · Phase 3</span>
          </div>
        </div>
      </aside>

      {/* --- Main ------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-rule bg-card px-4">
          {/* The real ⌘K palette — including serial/IMEI lookup — is Phase 4 (§11).
              Until then this filters the product list, which is honest and useful. */}
          <form action="/products" className="w-full max-w-md">
            <input
              type="search"
              name="q"
              placeholder="Find a product by name, SKU or model…"
              aria-label="Search products"
              className="tnum h-9 w-full rounded-[3px] border border-rule bg-plate/60 px-2.5 text-[13px] placeholder:font-sans placeholder:text-graphite/70 focus:border-signal focus:bg-card focus:outline-none"
            />
          </form>
        </header>

        <main className="flex-1 p-5 lg:p-7">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
