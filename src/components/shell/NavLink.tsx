'use client';

import Link from 'next/link';
import { useId } from 'react';
import { usePathname } from 'next/navigation';

export function NavLink({
  href,
  children,
  icon,
  onClick,
  tooltip,
  tooltipPlacement = 'bottom',
  exact = false,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  tooltip?: string;
  tooltipPlacement?: 'top' | 'bottom';
  exact?: boolean;
}) {
  const pathname = usePathname();
  const tooltipId = useId();
  const active = pathname === href || (!exact && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-describedby={tooltip ? tooltipId : undefined}
      className={`group relative flex items-center gap-2 rounded-[3px] px-2 py-1.5 text-[13px] transition-colors ${
        active ? 'bg-plate font-medium text-ink' : 'text-graphite hover:bg-plate/60 hover:text-ink'
      }`}
    >
      {active && (
        <span className="absolute top-1.5 bottom-1.5 -left-2 w-[2px] rounded-full bg-signal" />
      )}
      {icon}
      <span className="min-w-0">{children}</span>
      {tooltip && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`pointer-events-none absolute right-2 left-2 z-[80] invisible rounded-[3px] bg-ink px-2.5 py-2 text-left text-[11px] font-normal leading-[1.4] text-white opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-hover:delay-[350ms] group-focus-visible:visible group-focus-visible:opacity-100 group-focus-visible:delay-[350ms] ${
            tooltipPlacement === 'top'
              ? 'bottom-[calc(100%+2px)]'
              : 'top-[calc(100%+2px)]'
          }`}
        >
          {tooltip}
        </span>
      )}
    </Link>
  );
}
