import { useId } from "react";
import { useNavigate } from "react-router";
import { useI18n } from "@/lib/i18n/client";
import { libraryHref, SORT_OPTIONS, type SortOption } from "@/lib/library";

export function SortSelect({
  value,
  query,
  category,
  binder,
}: {
  value: SortOption;
  query: string;
  category: number | null;
  binder: number | null;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const id = useId();
  const options = SORT_OPTIONS.filter((option) => option !== "relevance" || query);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium whitespace-nowrap text-stone-600">
        {t("library.sortLabel")}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const sort = event.target.value as SortOption;
          navigate(libraryHref({ q: query, category, binder, sort }), { preventScrollReset: true });
        }}
        className="h-10 rounded-lg border border-stone-300 bg-white pr-8 pl-3 text-[15px] text-stone-800 shadow-sm hover:border-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {t(`library.sort.${option}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
