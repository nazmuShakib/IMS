'use client';
import Link from 'next/link';
import { useI18n } from '@/components/i18n/I18nProvider';
import { reportText } from '@/lib/report-copy';
export default function ReportError({ reset }: { reset: () => void }) {
  const { locale } = useI18n();
  return (
    <div role="alert" className="rounded border border-rule bg-card p-4">
      <p>{reportText(locale, 'error')}</p>
      <div className="mt-3 flex gap-3">
        <button onClick={reset} className="text-signal underline">
          {reportText(locale, 'retry')}
        </button>
        <Link href="/reports" className="text-signal underline">
          {reportText(locale, 'back')}
        </Link>
      </div>
    </div>
  );
}
