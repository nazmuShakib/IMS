'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`relative block rounded-[3px] px-2 py-1.5 text-[13px] transition-colors ${
        active ? 'bg-plate font-medium text-ink' : 'text-graphite hover:bg-plate/60 hover:text-ink'
      }`}
    >
      {active && (
        <span className="absolute top-1.5 bottom-1.5 -left-2 w-[2px] rounded-full bg-signal" />
      )}
      {children}
    </Link>
  );
}
