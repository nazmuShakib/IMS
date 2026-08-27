'use client';

import { useEffect, useState } from 'react';
import { Button, Select } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';

type ReceiptLayout = 'a4' | 'thermal80' | 'thermal58';

export function PrintReceiptButton({ contractId, paymentId }: { contractId: string; paymentId: string }) {
  const { t } = useI18n();
  const [layout, setLayout] = useState<ReceiptLayout>('thermal80');

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.emi-receipt-root');
    if (!root) return;
    root.dataset.layout = layout === 'a4' ? 'a4' : 'thermal';
    root.dataset.thermalWidth = layout === 'thermal58' ? '58' : '80';
  }, [layout]);

  function changeLayout(next: ReceiptLayout) {
    setLayout(next);
  }

  function printReceipt() {
    window.print();
  }

  return <>
    <style>{`@media print { @page { size: ${layout === 'a4' ? 'A4 portrait' : 'auto'}; margin: 0; } }`}</style>
    <div className="print:hidden" data-contract-id={contractId} data-payment-id={paymentId}>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <Select aria-label={t('emi.receiptLayout')} className="!w-52 shrink-0" value={layout} onChange={(event) => changeLayout(event.target.value as ReceiptLayout)}>
          <option value="a4">{t('emi.a4Printer')}</option>
          <option value="thermal80">{t('emi.thermalPrinter')}</option>
          <option value="thermal58">{t('emi.thermal58Printer')}</option>
        </Select>
        <Button type="button" onClick={printReceipt}>{t('emi.printReceipt')}</Button>
      </div>
    </div>
  </>;
}
