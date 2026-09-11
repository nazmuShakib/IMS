'use client';
import Link from 'next/link';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Button, Card } from '@/components/ui';
export default function ExpenseError({ reset }: { reset: () => void }) {
  const { t } = useI18n();
  return <Card className="p-5"><p role="alert" className="mb-4">{t('expenses.error')}</p><div className="flex items-center gap-4"><Button onClick={reset}>{t('search.tryAgain')}</Button><Link href="/expenses" className="text-signal underline">{t('expenses.back')}</Link></div></Card>;
}
