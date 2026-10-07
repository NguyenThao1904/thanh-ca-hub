import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { localeNames, locales } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div role="group" aria-label={t("settings.language")} className={cn("inline-flex items-center gap-1", className)}>
      <Languages className="mr-1 size-4 text-stone-500" aria-hidden />
      {locales.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={option === locale}
          onClick={() => setLocale(option)}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
            option === locale ? "bg-brand-100 text-brand-900" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
          )}
        >
          {localeNames[option]}
        </button>
      ))}
    </div>
  );
}
