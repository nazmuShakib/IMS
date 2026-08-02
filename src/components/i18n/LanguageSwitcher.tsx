import { setLocaleAction } from '@/actions/locale';
import type { Locale } from '@/lib/i18n/config';
import { translate } from '@/lib/i18n/messages';

export function LanguageSwitcher({ locale, compact = false }: { locale: Locale; compact?: boolean }) {
  const next = locale === 'en' ? 'bn' : 'en';
  return (
    <form action={setLocaleAction}>
      <input type="hidden" name="locale" value={next} />
      <button
        type="submit"
        aria-label={translate(locale, 'language.switchTo')}
        className={`${compact ? 'h-8 px-2.5 text-[11px]' : 'h-9 px-3 text-[12px]'} inline-flex items-center justify-center rounded-[3px] border border-rule bg-card font-medium text-ink hover:bg-plate`}
      >
        {translate(locale, next === 'bn' ? 'language.bengali' : 'language.english')}
      </button>
    </form>
  );
}
