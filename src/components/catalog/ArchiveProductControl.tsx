'use client';
import { useActionState, useState } from 'react';
import { createPortal } from 'react-dom';
import { archiveProductWithFeedback } from '@/actions/catalog';
import { Button } from '@/components/ui';
import { useModalDialog } from '@/components/ui/useModalDialog';
import { useI18n } from '@/components/i18n/I18nProvider';
export function ArchiveProductControl({ productId }: { productId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(archiveProductWithFeedback, {});
  const dialog = useModalDialog(open, () => { if (!pending) setOpen(false); });
  return <>
    <Button type="button" variant="danger" onClick={() => setOpen(true)}>{t('products.archive')}</Button>
    {open && createPortal(<div className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/45 p-4" onMouseDown={e => { if (e.target === e.currentTarget && !pending) setOpen(false); }}>
      <div ref={dialog} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="archive-title" aria-describedby="archive-description" aria-busy={pending} className="w-full max-w-sm rounded-[3px] border border-rule bg-card p-5 shadow-xl">
        <h2 id="archive-title" className="text-[16px] font-semibold">{t('products.confirmArchive')}</h2>
        <p id="archive-description" className="mt-2 text-[13px] text-graphite">{t('products.confirmArchiveHelp')}</p>
        {state.error && <p role="alert" className="mt-3 text-[13px] text-out">{t('products.archiveFailed')}</p>}
        <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <form action={action}><input type="hidden" name="id" value={productId} /><Button type="submit" variant="danger" disabled={pending}>{t(pending ? 'common.saving' : 'products.archive')}</Button></form>
        </div>
      </div>
    </div>, document.body)}
  </>;
}
