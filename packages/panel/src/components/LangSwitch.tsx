import { useI18n } from '../i18n';
import type { Locale } from '../i18n/strings';

export function LangSwitch() {
  const { locale, setLocale, t } = useI18n();
  const langs: Locale[] = ['pl', 'en'];
  return (
    <div className="lang-switch" role="group" aria-label={t('lang.switch')}>
      {langs.map((l) => (
        <button
          key={l}
          type="button"
          className={l === locale ? 'active' : ''}
          aria-pressed={l === locale}
          onClick={() => setLocale(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
