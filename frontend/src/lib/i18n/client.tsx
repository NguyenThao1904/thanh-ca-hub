import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createTranslator, isLocale, type Locale, type Translate } from "./config";

const STORAGE_KEY = "locale";

type I18nValue = { locale: Locale; t: Translate; setLocale: (locale: Locale) => void };

const I18nContext = createContext<I18nValue | null>(null);

function savedLocale(): Locale | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/** The language chosen on this device, or the choir's default language. */
export function I18nProvider({ defaultLocale, children }: { defaultLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => savedLocale() ?? defaultLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts until the page is closed.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, t: createTranslator(locale), setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside <I18nProvider>");
  return context;
}
