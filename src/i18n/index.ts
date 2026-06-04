import type { Dict, Lang } from './types';

export type { Dict, Lang, Entry, Translator } from './types';

const VAR_RE = /\{(\w+)\}/g;

/**
 * Resolve a dotted key from a flat dictionary.
 * Mirrors the v1 i18n.js lookup chain: active-lang → vi → the key itself,
 * then interpolates {var} placeholders. Unknown placeholders are left intact.
 */
export function resolve(
  dict: Dict,
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const entry = dict[key];
  let s: string | undefined;
  if (entry) {
    s = entry[lang] || entry.vi;
  }
  if (s == null || s === '') s = key;
  if (vars) {
    s = s.replace(VAR_RE, (m, name: string) =>
      vars[name] != null ? String(vars[name]) : m,
    );
  }
  return s;
}
