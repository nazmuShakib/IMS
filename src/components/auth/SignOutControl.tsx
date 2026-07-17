'use client';

import { useEffect, useState } from 'react';

import { logoutAction } from '@/actions/auth';
import { Button } from '@/components/ui';

export function SignOutControl() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-[11px] text-graphite underline underline-offset-2 hover:text-ink"
      >
        Sign out
      </button>

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
            aria-labelledby="sign-out-title"
            aria-describedby="sign-out-description"
            className="w-full max-w-sm rounded-[3px] border border-rule bg-card p-5 shadow-xl"
          >
            <h2 id="sign-out-title" className="text-[16px] font-semibold">
              Sign out?
            </h2>
            <p id="sign-out-description" className="mt-2 text-[13px] text-graphite">
              You will need to enter your email and password to access the inventory again.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} autoFocus>
                Cancel
              </Button>
              <form action={logoutAction}>
                <Button type="submit" variant="danger">
                  Sign out
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
