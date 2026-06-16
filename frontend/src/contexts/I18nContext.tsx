import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { Translations } from '../i18n/types';
import { resolve, interpolate, isRtl } from '../i18n/utils';
import en from '../i18n/locales/en';

// ─── Locale registry ──────────────────────────────────────────────────────────

export type LocaleCode = 'en' | 'hi' | 'mr' | 'es' | 'fr' | 'de' | 'zh' | 'pt' | 'ar';

export const LOCALES: Record<LocaleCode, { label: string; flag: string; nativeLabel: string }> = {
  en: { label: 'English',    flag: '🇬🇧', nativeLabel: 'English' },
  hi: { label: 'Hindi',      flag: '🇮🇳', nativeLabel: 'हिंदी' },
  mr: { label: 'Marathi',    flag: '🇮🇳', nativeLabel: 'मराठी' },
  es: { label: 'Spanish',    flag: '🇪🇸', nativeLabel: 'Español' },
  fr: { label: 'French',     flag: '🇫🇷', nativeLabel: 'Français' },
  de: { label: 'German',     flag: '🇩🇪', nativeLabel: 'Deutsch' },
  zh: { label: 'Chinese',    flag: '🇨🇳', nativeLabel: '中文' },
  pt: { label: 'Portuguese', flag: '🇧🇷', nativeLabel: 'Português' },
  ar: { label: 'Arabic',     flag: '🇸🇦', nativeLabel: 'العربية' },
};

// ─── Lazy loaders ─────────────────────────────────────────────────────────────
// English is bundled eagerly (default locale, always needed).
// All other locales are code-split and fetched on first language switch.

type LocaleModule = { default: Translations };

const LOCALE_LOADERS: Record<LocaleCode, () => Promise<LocaleModule>> = {
  en: async () => ({ default: en }),
  hi: () => import('../i18n/locales/hi'),
  mr: () => import('../i18n/locales/mr'),
  es: () => import('../i18n/locales/es'),
  fr: () => import('../i18n/locales/fr'),
  de: () => import('../i18n/locales/de'),
  zh: () => import('../i18n/locales/zh'),
  pt: () => import('../i18n/locales/pt'),
  ar: () => import('../i18n/locales/ar'),
};

// In-memory cache: each locale is loaded at most once per session
const localeCache = new Map<LocaleCode, Translations>();
localeCache.set('en', en);

const STORAGE_KEY = 'ds_locale';

// ─── Context types ────────────────────────────────────────────────────────────

interface I18nContextValue {
  locale: LocaleCode;
  /** Change the active locale. Returns a promise that resolves once the locale file is loaded. */
  setLocale: (code: LocaleCode) => Promise<void>;
  /**
   * Translate a dot-notation key.
   * Supports interpolation: t('key', { count: 3, name: 'Alice' })
   * Supports pluralisation via pipe in translation value: "1 item | {count} items"
   */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** True while a non-English locale file is being fetched */
  isLoading: boolean;
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

  // Active translations object; starts with the eagerly-bundled English locale
  const [translations, setTranslations] = useState<Translations>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as LocaleCode | null;
    if (stored && stored !== 'en' && localeCache.has(stored)) {
      return localeCache.get(stored)!;
    }
    return en;
  });

  const [isLoading, setIsLoading] = useState(false);

  const applyLocale = useCallback((code: LocaleCode, trans: Translations) => {
    setTranslations(trans);
    setLocaleState(code);
    localStorage.setItem(STORAGE_KEY, code);
    document.documentElement.lang = code;
    document.documentElement.dir = isRtl(code) ? 'rtl' : 'ltr';
  }, []);

  const setLocale = useCallback(async (code: LocaleCode): Promise<void> => {
    if (localeCache.has(code)) {
      applyLocale(code, localeCache.get(code)!);
      return;
    }
    setIsLoading(true);
    try {
      const mod = await LOCALE_LOADERS[code]();
      localeCache.set(code, mod.default);
      applyLocale(code, mod.default);
    } catch (err) {
      console.error('[i18n] Failed to load locale', code, err);
      // Fall back to English on load failure
      applyLocale('en', en);
    } finally {
      setIsLoading(false);
    }
  }, [applyLocale]);

  // On mount: if a non-English locale was stored, load it lazily
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as LocaleCode | null;
    if (stored && stored !== 'en' && stored in LOCALES) {
      if (!localeCache.has(stored)) {
        setLocale(stored);
      } else {
        applyLocale(stored, localeCache.get(stored)!);
      }
    } else {
      document.documentElement.lang = locale;
      document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const raw = resolve(translations as unknown as Record<string, unknown>, key);
      return params ? interpolate(raw, params) : raw;
    },
    [translations],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, isLoading }}>
      {children}
    </I18nContext.Provider>
  );
};
