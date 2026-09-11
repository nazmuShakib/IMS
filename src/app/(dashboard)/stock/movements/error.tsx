'use client';
import { Button, Card } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
export default function MovementError({ reset }: { reset: () => void }) {
  const { t } = useI18n();
  return <Card className="p-6"><p role="alert" className="mb-4">{t('ledger.loadFailed')}</p><Button onClick={reset}>{t('ledger.retryLoad')}</Button></Card>;
}
