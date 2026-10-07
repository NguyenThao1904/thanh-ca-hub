import { localeTag, type Locale } from "@/lib/i18n/config";

// Dates are shown in the choir's time zone (TIME_ZONE on the server), so every
// member sees the same date whatever their device's settings.
let timeZone = "Asia/Ho_Chi_Minh";

export function setTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    timeZone = value;
  } catch {
    timeZone = "UTC";
  }
}

export function formatDate(value: string | Date, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

export function formatDateTime(value: string | Date, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

export function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(localeTag(locale)).format(value);
}
