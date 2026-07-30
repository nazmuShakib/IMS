import Link from 'next/link';
import { getSession } from '@/lib/session';
import { Badge } from '@/components/ui';
import { SignOutControl } from '@/components/auth/SignOutControl';
import { CommandPalette } from '@/components/search/CommandPalette';
import { MobileNavigation } from '@/components/shell/MobileNavigation';
import { NavigationLinks } from '@/components/shell/NavigationLinks';

export const dynamic = 'force-dynamic'; // JSON repos read from disk per request

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await getSession();

  return (
    <div className="flex min-h-screen">
      {/* --- Sidebar ---------------------------------------------------- */}
      <aside className="hidden w-52 shrink-0 flex-col overflow-hidden border-r border-rule bg-card print:hidden md:sticky md:top-0 md:flex md:h-screen md:self-start">
        <div className="border-b border-rule px-4 py-4">
          <Link href="/" className="block">
            <span className="text-[13px] font-semibold tracking-[-0.01em]">Inventory</span>
            <span className="eyebrow mt-0.5 block">Electronics Shop</span>
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <NavigationLinks role={role} />
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
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-rule bg-card px-4 print:hidden">
          <MobileNavigation role={role} userName={user.name} />
          <CommandPalette />
        </header>

        <main className="flex-1 p-5 print:p-0 lg:p-7">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
