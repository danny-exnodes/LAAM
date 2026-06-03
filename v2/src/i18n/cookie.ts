import type { Lang } from './types';

export const LANG_COOKIE = 'laam_lang';
const SUPPORTED: readonly Lang[] = ['vi', 'en', 'zh'];

function isLang(v: string): v is Lang {
  return (SUPPORTED as readonly string[]).includes(v);
}

/** Parse a cookie string (server header or document.cookie). */
export function readLangFromCookie(cookie?: string | null): Lang | null {
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === LANG_COOKIE) {
      const v = decodeURIComponent(rest.join('='));
      return isLang(v) ? v : null;
    }
  }
  return null;
}

/** Persist the active lang (client-only; 1-year cookie). */
export function writeLangCookie(lang: Lang): void {
  if (typeof document === 'undefined') return;
  if (!isLang(lang)) return;
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}
