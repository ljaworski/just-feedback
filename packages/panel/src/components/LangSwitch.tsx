import { useI18n } from '../i18n';
import { localeOptions } from '../i18n/config';

export function LangSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t('lang.switch')}>
      {localeOptions.map(({ locale: optionLocale, label }) => (
        <button
          key={optionLocale}
          type="button"
          className={optionLocale === locale ? 'active' : ''}
          aria-pressed={optionLocale === locale}
          onClick={() => setLocale(optionLocale)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
