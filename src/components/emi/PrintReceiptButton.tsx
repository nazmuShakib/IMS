'use client';

import { useEffect, useState } from 'react';
import { Button, Select } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';

type ReceiptLayout = 'a4' | 'thermal';

export function PrintReceiptButton() {
  const { t } = useI18n();
  const [layout, setLayout] = useState<ReceiptLayout>('a4');

  useEffect(() => {
    const style = document.createElement('style');
    style.dataset.emiReceiptPage = 'true';
    style.textContent = `@media print { @page { size: ${layout === 'a4' ? 'A4 portrait' : 'auto'}; margin: 0; } }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [layout]);

  function changeLayout(next: ReceiptLayout) {
    setLayout(next);
    const root = document.querySelector<HTMLElement>('.emi-receipt-root');
    if (root) root.dataset.layout = next;
  }

  return <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap print:hidden">
    <Select aria-label={t('emi.receiptLayout')} className="!w-52 shrink-0" value={layout} onChange={(event) => changeLayout(event.target.value as ReceiptLayout)}>
      <option value="a4">{t('emi.a4Printer')}</option>
      <option value="thermal">{t('emi.thermalPrinter')}</option>
    </Select>
    <Button type="button" onClick={() => window.print()}>{t('emi.printReceipt')}</Button>
  </div>;
}
