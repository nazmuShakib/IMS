'use client';

import { useActionState, useEffect, useState } from 'react';

import { discardCartAction } from '@/actions/checkout';
import { Button } from '@/components/ui';

export function DiscardDraftControl({
  cartId,
  itemCount,
}: {
  cartId: string;
  itemCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(discardCartAction, {});

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-graphite underline underline-offset-2 hover:text-out"
      >
        Discard draft
      </button>
      {state.error && <p className="mt-1 text-[11px] text-out">{state.error}</p>}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-draft-title"
            aria-describedby="discard-draft-description"
            className="w-full max-w-sm rounded-[3px] border border-rule bg-card p-5 shadow-xl"
          >
            <h2 id="discard-draft-title" className="text-[16px] font-semibold">
              Discard this draft?
            </h2>
            <p id="discard-draft-description" className="mt-2 text-[13px] text-graphite">
              {itemCount > 0
                ? `${itemCount} cart ${itemCount === 1 ? 'line' : 'lines'} and the saved customer/payment details will be removed.`
                : 'The saved customer and payment details will be removed.'}
              {' '}Inventory will not change.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} autoFocus>
                Keep draft
              </Button>
              <form action={action}>
                <input type="hidden" name="cartId" value={cartId} />
                <Button type="submit" variant="danger" disabled={pending}>
                  {pending ? 'Discarding…' : 'Discard draft'}
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
