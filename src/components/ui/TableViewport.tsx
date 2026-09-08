'use client';

import type { PointerEvent, ReactNode } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';

export function TableViewport({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  function showScrollbar(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.classList.add('scrollbar-active');
  }

  function hideScrollbar(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.classList.remove('scrollbar-active');
  }

  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={t('catalog.scrollable')}
      onPointerEnter={showScrollbar}
      onPointerLeave={hideScrollbar}
      className={`contextual-scroll-area max-h-[min(65vh,42rem)] overflow-auto overscroll-contain focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal ${className}`}
    >
      {children}
    </div>
  );
}
