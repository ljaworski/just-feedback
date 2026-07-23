import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, resolveInitialLocale, useI18n } from '../i18n';
import { LangSwitch } from '../components/LangSwitch';
import { en, pl } from '../i18n/strings';

describe('dictionary completeness', () => {
  it('pl and en have exactly the same keys', () => {
    const enKeys = Object.keys(en).sort();
    const plKeys = Object.keys(pl).sort();
    expect(plKeys).toEqual(enKeys);
  });

  it('no value is empty', () => {
    for (const [k, v] of Object.entries(en)) expect(v, `en.${k}`).not.toBe('');
    for (const [k, v] of Object.entries(pl)) expect(v, `pl.${k}`).not.toBe('');
  });
});

describe('resolveInitialLocale', () => {
  it('honors a stored valid value over the browser preference', () => {
    expect(resolveInitialLocale('en', ['pl-PL'])).toBe('en');
    expect(resolveInitialLocale('pl', ['en-US'])).toBe('pl');
  });
  it('falls back to browser first preference when nothing is stored', () => {
    expect(resolveInitialLocale(null, ['pl-PL', 'en'])).toBe('pl');
    expect(resolveInitialLocale(null, ['pl'])).toBe('pl');
    expect(resolveInitialLocale(null, ['en-US'])).toBe('en');
    expect(resolveInitialLocale(null, ['de-DE'])).toBe('en');
    expect(resolveInitialLocale(null, [])).toBe('en');
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

    await user.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByTestId('label')).toHaveTextContent('Log in');
    expect(field.value).toBe('hello');
  });
});
