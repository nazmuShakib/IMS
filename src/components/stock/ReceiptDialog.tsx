'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Native modality keeps the background inert and traps keyboard focus. */
export function ReceiptDialog({ title, description, busy = false, returnFocus, onClose, children }: {
  title: string;
  description: string;
  busy?: boolean;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = returnFocus ?? document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; previousFocus?.focus(); };
  }, [returnFocus]);

  return <dialog ref={ref} role="dialog" aria-modal="true" aria-busy={busy} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-[3px] border border-rule bg-card p-0 text-ink shadow-xl backdrop:bg-ink/45"
    onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      )];
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
    <div className="border-b border-rule p-4"><h2 id={`${id}-title`} className="text-[18px] font-semibold">{title}</h2>
      <p id={`${id}-description`} className="mt-1 text-[13px] text-graphite">{description}</p></div>
    {children}
  </dialog>;
}
