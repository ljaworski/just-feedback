import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  dictionaries,
  en,
  isLocale,
  localeFromBrowserLanguage,
  localeMetadata,
  type Locale,
} from './config';
import type { TranslationKey } from './locales/en';

const STORAGE_KEY = 'jf_locale';

/** Stored valid value wins; otherwise resolve the first browser preference, falling back to English. */
export function resolveInitialLocale(
  stored: string | null,
  browserLangs: readonly string[],
): Locale {
  if (isLocale(stored)) return stored;
  return localeFromBrowserLanguage(browserLangs[0] ?? '');
}

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  formatRelative: (iso: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function interpolate(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
}

/** Relative time for recent dates, absolute (e.g. "12 Mar 2026") for older ones. */
function formatRelative(iso: string, locale: Locale): string {
  const intl = localeMetadata[locale].intlLocale;
  const then = new Date(iso).getTime();
  const diffSec = Math.round((then - Date.now()) / 1000); // negative = past
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(intl, { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diffSec), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 6 * 86400) return rtf.format(Math.round(diffSec / 86400), 'day');
  return new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', year: 'numeric' }).format(then);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const langs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
    return resolveInitialLocale(stored, langs);
  });

  useEffect(() => {
    document.documentElement.lang = localeMetadata[locale].htmlLang;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore persistence errors */
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => {
      const dict = dictionaries[locale];
      const value = dict[key] ?? en[key] ?? key; // safe fallback to English, then the key
      return interpolate(value, params);
    },
    [locale],
  );

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t, formatRelative: (iso) => formatRelative(iso, locale) }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
