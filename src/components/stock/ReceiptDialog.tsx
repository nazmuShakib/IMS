'use client';

import { lockBodyScroll } from '@/lib/body-scroll-lock';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Native modality keeps the background inert and traps keyboard focus. */
export function ReceiptDialog({ title, description, headerAside, headerActions, busy = false, panel = false, returnFocus, onClose, children }: {
  title: string;
  description?: string;
  headerAside?: ReactNode;
  headerActions?: ReactNode;
  busy?: boolean;
  panel?: boolean;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = returnFocus ?? document.activeElement as HTMLElement | null;
    dialog.showModal();
    const unlockScroll = lockBodyScroll();
    return () => { dialog.close(); unlockScroll(); previousFocus?.focus(); };
  }, [returnFocus]);

  return <dialog ref={ref} role="dialog" aria-modal="true" aria-busy={busy} aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined}
    className={`${panel ? "intake-panel" : "m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl rounded-lg"} overflow-y-auto border border-rule bg-card p-0 text-ink shadow-xl backdrop:bg-ink/45`}
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
      )].filter(control => {
        const collapsed = control.closest('details:not([open])');
        return !control.matches(':disabled') && (!collapsed || (control.tagName === 'SUMMARY' && control.parentElement === collapsed));
      });
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => {
      if (!busy && event.target === event.currentTarget) {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }
    }}>
    <div className={`border-b border-rule bg-card ${panel ? 'sticky top-0 z-20 px-4 py-2' : 'p-4'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 id={`${id}-title`} className="text-[18px] font-semibold">{title}</h2>
          {headerAside}
        </div>
        {headerActions}
      </div>
      {description && <p id={`${id}-description`} className="mt-1 text-[13px] text-graphite">{description}</p>}
    </div>
    {children}
  </dialog>;
}
