import { afterEach, expect, test } from 'vitest';
import { readLangFromCookie, writeLangCookie, LANG_COOKIE } from './cookie';

afterEach(() => {
  document.cookie = `${LANG_COOKIE}=; path=/; max-age=0`;
});

test('LANG_COOKIE is laam_lang', () => {
  expect(LANG_COOKIE).toBe('laam_lang');
});

test('reads a valid lang from a cookie string', () => {
  expect(readLangFromCookie('foo=1; laam_lang=zh; bar=2')).toBe('zh');
  expect(readLangFromCookie('laam_lang=en')).toBe('en');
});

test('returns null for missing or invalid lang', () => {
  expect(readLangFromCookie('foo=1')).toBeNull();
  expect(readLangFromCookie('laam_lang=de')).toBeNull();
  expect(readLangFromCookie('')).toBeNull();
  expect(readLangFromCookie(undefined)).toBeNull();
});

test('writeLangCookie persists and is read back via document.cookie', () => {
  writeLangCookie('vi');
  expect(readLangFromCookie(document.cookie)).toBe('vi');
});
