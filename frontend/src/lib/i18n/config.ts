import { en, type MessageKey, type Messages } from "./messages/en";
import { vi } from "./messages/vi";

export const locales = ["vi", "en"] as const;
export type Locale = (typeof locales)[number];

export const localeNames: Record<Locale, string> = { vi: "Tiếng Việt", en: "English" };

export const messages: Record<Locale, Messages> = { vi, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** BCP 47 tag used for dates and numbers. */
export function localeTag(locale: Locale) {
  return locale === "vi" ? "vi-VN" : "en-GB";
}

export type TranslateVars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: TranslateVars) => string;

export function createTranslator(locale: Locale): Translate {
  const dictionary = messages[locale];
  const plural = new Intl.PluralRules(localeTag(locale));

  return (key, vars) => {
    let template = dictionary[key] ?? key;
    if (vars && typeof vars.count === "number" && plural.select(vars.count) === "one") {
      const singular = `${key}_one`;
      if (singular in dictionary) template = dictionary[singular as MessageKey];
    }
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
  };
}

export type { MessageKey };
