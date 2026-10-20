import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Lang } from '../domain/models';
import { en, type MessageKey } from './en';
import { fa } from './fa';

const CATALOGS: Record<Lang, Record<MessageKey, string>> = { en, fa };

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = CATALOGS[lang][key] ?? en[key] ?? key;
  if (!vars) return template;
  const num = new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : 'en-US', { useGrouping: false });
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    if (v === undefined) return `{${name}}`;
    return typeof v === 'number' ? num.format(v) : v;
  });
}

export interface I18n {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  formatDate: (iso: string) => string;
}

export function makeI18n(lang: Lang): I18n {
  const dateFmt = new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return {
    lang,
    dir: lang === 'fa' ? 'rtl' : 'ltr',
    t: (key, vars) => translate(lang, key, vars),
    formatDate: (iso) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
    },
  };
}

const I18nContext = createContext<I18n>(makeI18n('fa'));

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => makeI18n(lang), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
