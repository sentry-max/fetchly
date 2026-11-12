import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { languageStorageKey } from "../config";
import { english, type Language, type Messages } from "./messages";
import { persian } from "./persian";

interface I18nContextValue {
  language: Language;
  locale: string;
  direction: "ltr" | "rtl";
  messages: Messages;
  setLanguage: (language: Language) => void;
}

const catalogs: Record<Language, { messages: Messages; locale: string; direction: "ltr" | "rtl" }> = {
  en: { messages: english, locale: "en-US", direction: "ltr" },
  fa: { messages: persian, locale: "fa-IR", direction: "rtl" },
};

const I18nContext = createContext<I18nContextValue | null>(null);

function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "fa";
}

function detectInitialLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(languageStorageKey);
    if (isLanguage(stored)) {
      return stored;
    }
  } catch {
    // Storage can be unavailable in private browsing; fall through to the browser language.
  }
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  return preferred.some((tag) => tag?.toLowerCase().startsWith("fa")) ? "fa" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectInitialLanguage);
  const catalog = catalogs[language];

  useEffect(() => {
    const root = document.documentElement;
    root.lang = language;
    root.dir = catalog.direction;
    document.title = catalog.messages.documentTitle;
  }, [language, catalog]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(languageStorageKey, next);
    } catch {
      // Preference simply isn't persisted.
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      locale: catalog.locale,
      direction: catalog.direction,
      messages: catalog.messages,
      setLanguage,
    }),
    [language, catalog, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
