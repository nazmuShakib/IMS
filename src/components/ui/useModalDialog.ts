'use client';
import { useEffect, useRef } from 'react';
export function useModalDialog(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    const padding = document.body.style.paddingRight;
    const width = window.innerWidth - document.documentElement.clientWidth;
    if (width > 0) document.body.style.paddingRight = `${(parseFloat(getComputedStyle(document.body).paddingRight) || 0) + width}px`;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') ?? []).filter(el => {
      if (el.closest('[hidden], [inert]')) return false;
      const closed = el.closest('details:not([open])');
      return !closed || Boolean(closed.querySelector('summary')?.contains(el));
    });
    (focusable()[0] ?? ref.current)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0]; const last = elements.at(-1);
      if (!first) { event.preventDefault(); ref.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const contain = (event: FocusEvent) => { if (event.target instanceof Node && ref.current && !ref.current.contains(event.target)) (focusable()[0] ?? ref.current).focus(); };
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', contain);
    return () => {
      document.removeEventListener('keydown', keydown); document.removeEventListener('focusin', contain);
      document.body.style.overflow = overflow; document.body.style.paddingRight = padding;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);
  return ref;
}
