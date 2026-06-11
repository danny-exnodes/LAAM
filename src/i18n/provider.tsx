'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Dict, Lang, Translator } from './types';
import { resolve } from './index';
import { writeLangCookie } from './cookie';

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const Ctx = createContext<LangCtx | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const [active, setActive] = useState<Lang>(lang);
  const setLang = useCallback((l: Lang) => {
    setActive(l);
    writeLangCookie(l);
    // Keep the SSR-set <html lang> in sync so screen readers switch voices (WCAG 3.1.1).
    if (typeof document !== 'undefined') document.documentElement.lang = l;
  }, []);
  const value = useMemo<LangCtx>(() => ({ lang: active, setLang }), [active, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLang must be used within an I18nProvider');
  return ctx;
}

export function useT(namespace: Dict): Translator {
  const { lang } = useLang();
  return useCallback<Translator>(
    (key, vars) => resolve(namespace, lang, key, vars),
    [namespace, lang],
  );
}
