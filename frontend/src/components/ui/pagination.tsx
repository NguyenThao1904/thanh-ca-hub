import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import type { Translate } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const linkClass =
  "inline-flex h-11 items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 text-[15px] font-medium text-stone-800 shadow-sm hover:bg-stone-50";

export function Pagination({
  page,
  pageCount,
  hrefFor,
  t,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  t: Translate;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={t("pagination.label")} className="mt-6 flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link to={hrefFor(page - 1)} className={linkClass} rel="prev">
          <ChevronLeft className="size-4" aria-hidden />
          {t("pagination.previous")}
        </Link>
      ) : (
        <span className={cn(linkClass, "pointer-events-none opacity-40")} aria-hidden>
          <ChevronLeft className="size-4" />
          {t("pagination.previous")}
        </span>
      )}
      <span className="text-sm text-stone-600 tabular">{t("pagination.page", { page, pages: pageCount })}</span>
      {page < pageCount ? (
        <Link to={hrefFor(page + 1)} className={linkClass} rel="next">
          {t("pagination.next")}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span className={cn(linkClass, "pointer-events-none opacity-40")} aria-hidden>
          {t("pagination.next")}
          <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  );
}
