import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import en, { Translations } from '../locales/en';
import hi from '../locales/hi';
import es from '../locales/es';

// ─── Locale registry ──────────────────────────────────────────────────────────

export type LocaleCode = 'en' | 'hi' | 'es';

export const LOCALES: Record<LocaleCode, { label: string; flag: string; translations: Translations }> = {
  en: { label: 'English',  flag: '🇬🇧', translations: en },
  hi: { label: 'हिंदी',    flag: '🇮🇳', translations: hi },
  es: { label: 'Español',  flag: '🇪🇸', translations: es },
};

const STORAGE_KEY = 'ds_locale';

// ─── Deep-path resolver ───────────────────────────────────────────────────────

type DeepKeys<T, Prefix extends string = ''> =
  T extends string ? Prefix :
  { [K in keyof T]: K extends string
      ? DeepKeys<T[K], Prefix extends '' ? K : `${Prefix}.${K}`>
      : never
  }[keyof T];

type TranslationKey = DeepKeys<Translations>;

function resolve(obj: Record<string, unknown>, path: string): string {
  const value = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
  return typeof value === 'string' ? value : path;
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface I18nContextValue {
  locale: LocaleCode;
  setLocale: (code: LocaleCode) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const useI18n = (): I18nContextValue => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [locale, setLocaleState] = useState<LocaleCode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as LocaleCode | null;
    return stored && stored in LOCALES ? stored : 'en';
  });

  const setLocale = useCallback((code: LocaleCode) => {
    setLocaleState(code);
    localStorage.setItem(STORAGE_KEY, code);
    // Set lang attribute for screen-reader and browser tools
    document.documentElement.lang = code;
  }, []);

  const t = useCallback(
    (key: TranslationKey) =>
      resolve(LOCALES[locale].translations as unknown as Record<string, unknown>, key),
    [locale],
  );

  // Set initial lang attribute
  document.documentElement.lang = locale;

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
};
