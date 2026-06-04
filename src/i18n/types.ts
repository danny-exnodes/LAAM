export type Lang = 'vi' | 'en' | 'zh';

export interface Entry {
  vi: string;
  en: string;
  zh: string;
}

export type Dict = Record<string, Entry>;

export type Translator = (key: string, vars?: Record<string, string | number>) => string;
