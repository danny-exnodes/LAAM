import { expect, test } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider, useT, useLang } from './provider';
import type { Dict } from './types';

const ns: Dict = {
  'nav.dashboard': { vi: 'Tổng quan', en: 'Dashboard', zh: '仪表盘' },
};

function Sample() {
  const t = useT(ns);
  const { lang, setLang } = useLang();
  return (
    <div>
      <span data-testid="label">{t('nav.dashboard')}</span>
      <span data-testid="lang">{lang}</span>
      <button onClick={() => setLang('en')}>en</button>
    </div>
  );
}

test('renders the provider lang', () => {
  render(
    <I18nProvider lang="vi">
      <Sample />
    </I18nProvider>,
  );
  expect(screen.getByTestId('label').textContent).toBe('Tổng quan');
  expect(screen.getByTestId('lang').textContent).toBe('vi');
});

test('setLang switches the rendered language live', () => {
  render(
    <I18nProvider lang="vi">
      <Sample />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByText('en'));
  expect(screen.getByTestId('label').textContent).toBe('Dashboard');
  expect(screen.getByTestId('lang').textContent).toBe('en');
});

test('useLang throws a clear error outside a provider', () => {
  function Bare() {
    useLang();
    return null;
  }
  expect(() => render(<Bare />)).toThrow(/I18nProvider/);
});

function LangProbe() {
  const { setLang } = useLang();
  return <button onClick={() => setLang('zh')}>switch</button>;
}

test('updates <html lang> when the language changes (WCAG 3.1.1)', () => {
  document.documentElement.lang = 'vi';
  render(
    <I18nProvider lang="vi">
      <LangProbe />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByText('switch'));
  expect(document.documentElement.lang).toBe('zh');
});
