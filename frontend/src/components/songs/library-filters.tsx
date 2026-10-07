import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Category } from "@/api/types";
import { useI18n } from "@/lib/i18n/client";
import { libraryHref, type SortOption } from "@/lib/library";
import { binderNumbers, formatBinder } from "@/lib/location";
import { cn } from "@/lib/utils";

function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      to={href}
      preventScrollReset
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-10 shrink-0 snap-start items-center gap-2 rounded-full border px-3.5 text-[15px] font-medium whitespace-nowrap transition-colors",
        active
          ? "border-brand-800 bg-brand-800 text-white shadow-sm"
          : "border-stone-300 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50",
      )}
    >
      {children}
    </Link>
  );
}

type FilterProps = {
  categories: Category[];
  query: string;
  selected: Category | null;
  binder: number | null;
  sort: SortOption | null;
};

export function LibraryFilters({ categories, query, selected, binder, sort }: FilterProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <nav aria-label={t("library.categoryFilter")}>
        {/* One scrollable row on phones, wrapping chips on larger screens. */}
        <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <Chip href={libraryHref({ q: query, sort })} active={!selected}>
            {t("library.allCategories")}
          </Chip>
          {categories.map((category) => (
            <Chip key={category.id} href={libraryHref({ q: query, sort, category: category.id })} active={selected?.id === category.id}>
              <span
                className={cn(
                  "font-mono text-[13px] font-semibold",
                  selected?.id === category.id ? "text-gold-200" : "text-brand-700",
                )}
              >
                {category.code}
              </span>
              {category.name}
            </Chip>
          ))}
        </div>
      </nav>

      {selected && selected.binderCount > 1 ? (
        <nav aria-label={t("library.binderFilter")} className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-medium text-stone-600">{t("library.binder")}:</span>
          <Chip href={libraryHref({ q: query, sort, category: selected.id })} active={binder == null}>
            {t("library.allBinders")}
          </Chip>
          {binderNumbers(selected.binderCount).map((number) => (
            <Chip
              key={number}
              href={libraryHref({ q: query, sort, category: selected.id, binder: number })}
              active={binder === number}
            >
              <span className="font-mono">{formatBinder(selected.code, number)}</span>
            </Chip>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
