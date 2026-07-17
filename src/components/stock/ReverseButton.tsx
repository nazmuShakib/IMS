'use client';

import { useActionState, useEffect, useState } from 'react';
import { reverseMovementAction, type StockActionState } from '@/actions/stock';
import { Button, Input } from '@/components/ui';

/**
 * The ledger is append-only, so there is no "delete" and no "edit". Reversing
 * writes a NEW opposing entry and leaves the original visible forever. The UI
 * says so out loud, because an operator who expects a delete button needs to
 * understand why there isn't one.
 */
export function ReverseButton({ movementId, label }: { movementId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<StockActionState, FormData>(
    reverseMovementAction,
    {},
  );
  const [key, setKey] = useState('');

  useEffect(() => setKey(crypto.randomUUID()), []);
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] text-graphite underline underline-offset-2 hover:text-out"
      >
        Reverse
      </button>
    );
  }

  return (
    <form action={action} className="min-w-64">
      <input type="hidden" name="movementId" value={movementId} />
      <input type="hidden" name="idempotencyKey" value={key} />

      <p className="mb-2 text-[12px] text-graphite">
        Reversing <span className="font-medium text-ink">{label}</span>. The original entry
        stays in the ledger; a correction is written beneath it.
      </p>

      <Input
        name="note"
        required
        autoFocus
        placeholder="Why? e.g. wrong IMEI typed"
        className="mb-2"
      />

      {state.error && <p className="mb-2 text-[12px] text-out">{state.error}</p>}
      {state.fieldErrors?.note && (
        <p className="mb-2 text-[12px] text-out">{state.fieldErrors.note}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? 'Reversing…' : 'Reverse it'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
