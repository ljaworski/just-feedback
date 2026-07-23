import { en } from './locales/en';
import { pl } from './locales/pl';
import { zhHans } from './locales/zh-Hans';

export const dictionaries = {
  pl,
  en,
  'zh-Hans': zhHans,
} as const;

export type Locale = keyof typeof dictionaries;

export const localeOptions: ReadonlyArray<{ locale: Locale; label: string }> = [
  { locale: 'pl', label: 'PL' },
  { locale: 'en', label: 'EN' },
  { locale: 'zh-Hans', label: '简中' },
];

export const localeMetadata: Record<Locale, { intlLocale: string; htmlLang: string }> = {
  pl: { intlLocale: 'pl-PL', htmlLang: 'pl' },
  en: { intlLocale: 'en-US', htmlLang: 'en' },
  'zh-Hans': { intlLocale: 'zh-Hans', htmlLang: 'zh-Hans' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(dictionaries, value);
}

export function localeFromBrowserLanguage(language: string): Locale {
  const normalized = language.toLowerCase();
  if (normalized.startsWith('pl')) return 'pl';
  if (
    normalized === 'zh' ||
    normalized.startsWith('zh-hans') ||
    normalized.startsWith('zh-cn') ||
    normalized.startsWith('zh-sg')
  ) {
    return 'zh-Hans';
  }
  return 'en';
}

export { en, pl, zhHans };
