'use client';
import Link from 'next/link';
import { Button, Card } from '@/components/ui';
import { useI18n } from '@/components/i18n/I18nProvider';
export default function CustomersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return <Card className="mx-auto max-w-5xl p-6"><p role="alert" className="mb-4">{t('customers.failed')}</p>
    <div className="flex flex-wrap items-center gap-4"><Button onClick={reset}>{t('customers.retry')}</Button>
      <Link href="/customers" className="text-[13px] text-signal hover:underline">{t('customers.back')}</Link></div>
  </Card>;
}
