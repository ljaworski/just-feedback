import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, resolveInitialLocale, useI18n } from '../i18n';
import { LangSwitch } from '../components/LangSwitch';
import { dictionaries, en } from '../i18n/config';

describe('dictionary completeness', () => {
  it('all locales have exactly the same keys as English', () => {
    const enKeys = Object.keys(en).sort();
    for (const [locale, dictionary] of Object.entries(dictionaries)) {
      expect(Object.keys(dictionary).sort(), locale).toEqual(enKeys);
    }
  });

  it('has no empty values', () => {
    for (const [locale, dictionary] of Object.entries(dictionaries)) {
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value, `${locale}.${key}`).not.toBe('');
      }
    }
  });

  it('preserves the reference placeholders in every locale', () => {
    const placeholders = (value: string) =>
      Array.from(value.matchAll(/\{(\w+)\}/g), (match) => match[1]).sort();

    for (const [locale, dictionary] of Object.entries(dictionaries)) {
      for (const key of Object.keys(en) as Array<keyof typeof en>) {
        expect(placeholders(dictionary[key]), `${locale}.${key}`).toEqual(placeholders(en[key]));
      }
    }
  });
});

describe('resolveInitialLocale', () => {
  it('honors a stored valid value over the browser preference', () => {
    expect(resolveInitialLocale('en', ['pl-PL'])).toBe('en');
    expect(resolveInitialLocale('pl', ['en-US'])).toBe('pl');
    expect(resolveInitialLocale('zh-Hans', ['pl-PL'])).toBe('zh-Hans');
  });
  it('falls back to browser first preference when nothing is stored', () => {
    expect(resolveInitialLocale(null, ['pl-PL', 'en'])).toBe('pl');
    expect(resolveInitialLocale(null, ['pl'])).toBe('pl');
    expect(resolveInitialLocale(null, ['en-US'])).toBe('en');
    expect(resolveInitialLocale(null, ['de-DE'])).toBe('en');
    expect(resolveInitialLocale(null, [])).toBe('en');
  });
  it('recognizes simplified Chinese without selecting traditional Chinese', () => {
    expect(resolveInitialLocale(null, ['zh'])).toBe('zh-Hans');
    expect(resolveInitialLocale(null, ['zh-Hans'])).toBe('zh-Hans');
    expect(resolveInitialLocale(null, ['zh-CN'])).toBe('zh-Hans');
    expect(resolveInitialLocale(null, ['zh-SG'])).toBe('zh-Hans');
    expect(resolveInitialLocale(null, ['zh-Hant'])).toBe('en');
    expect(resolveInitialLocale(null, ['zh-TW'])).toBe('en');
    expect(resolveInitialLocale(null, ['zh-HK'])).toBe('en');
  });
  it('ignores an invalid stored value', () => {
    expect(resolveInitialLocale('xx', ['pl'])).toBe('pl');
  });
});

function Harness() {
  const { t } = useI18n();
  return (
    <div>
      <LangSwitch />
      <span data-testid="label">{t('login.submit')}</span>
      <input aria-label="field" />
    </div>
  );
}

describe('language switch (no reload, no data loss)', () => {
  beforeEach(() => localStorage.clear());

  it('changes texts instantly, preserves form input, persists to localStorage', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <Harness />
      </I18nProvider>,
    );
    // default locale in jsdom (navigator.language = en-US) => English
    expect(screen.getByTestId('label')).toHaveTextContent('Log in');

    const field = screen.getByLabelText('field') as HTMLInputElement;
    await user.type(field, 'hello');

    await user.click(screen.getByRole('button', { name: 'PL' }));
    expect(screen.getByTestId('label')).toHaveTextContent('Zaloguj');
    expect(field.value).toBe('hello'); // data not lost
    expect(localStorage.getItem('jf_locale')).toBe('pl');
    expect(document.documentElement.lang).toBe('pl');

    await user.click(screen.getByRole('button', { name: '简中' }));
    expect(screen.getByTestId('label')).toHaveTextContent('登录');
    expect(field.value).toBe('hello');
    expect(localStorage.getItem('jf_locale')).toBe('zh-Hans');
    expect(document.documentElement.lang).toBe('zh-Hans');

    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByTestId('label')).toHaveTextContent('Log in');
    expect(field.value).toBe('hello');
  });
});
