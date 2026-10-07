import { FileSpreadsheet, FolderOpen, LibraryBig, Plus, SearchX } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { query } from "@/api/client";
import { useCategories, useCurrentUser, useSongs } from "@/api/queries";
import { LibraryFilters } from "@/components/songs/library-filters";
import { RememberLibraryUrl } from "@/components/songs/library-memory";
import { SongResults, type SongRow } from "@/components/songs/song-results";
import { SortSelect } from "@/components/songs/sort-select";
import { buttonClasses, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { LibrarySkeleton, SongListSkeleton } from "@/components/ui/page-skeletons";
import { Pagination } from "@/components/ui/pagination";
import { LoadError } from "@/components/ui/query-state";
import { Spinner } from "@/components/ui/spinner";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { libraryHref, PAGE_SIZE, readLibraryParams } from "@/lib/library";
import { formatBinder } from "@/lib/location";
import { useTitle } from "@/lib/title";

export function LibraryPage() {
  const user = useCurrentUser();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const categories = useCategories();
  useTitle(t("library.title"));

  const { query: text, category, binder, explicitSort, sort, page } = readLibraryParams(
    (name) => searchParams.get(name) ?? undefined,
    categories.data ?? [],
  );
  // Until the categories are known, a category in the URL cannot be checked yet.
  const songs = useSongs({ q: text, category: category?.id ?? null, binder, sort, page }, { enabled: categories.isSuccess });

  const rows = songs.data?.items ?? [];
  const total = songs.data?.total ?? 0;

  // A page number past the end (e.g. after deletions): go back to the first page.
  useEffect(() => {
    if (songs.data && !songs.isPlaceholderData && songs.data.items.length === 0 && page > 1) {
      navigate(libraryHref({ q: text, category: category?.id, binder, sort: explicitSort }), { replace: true });
    }
  }, [songs.data, songs.isPlaceholderData, page, text, category, binder, explicitSort, navigate]);

  if (categories.isPending) return <LibrarySkeleton />;
  if (categories.isError) return <LoadError error={categories.error} retry={() => categories.refetch()} />;

  const songsRows: SongRow[] = rows.map((row) => ({
    id: row.id,
    songNumber: row.songNumber,
    title: row.title,
    composer: row.composer,
    firstSentence: row.firstSentence,
    categoryName: row.categoryName,
    categoryCode: row.categoryCode,
    binderNumber: row.binderNumber,
    pageNumber: row.pageNumber,
    updatedAt: row.updatedAt,
    hasPdf: row.hasPdf,
    imageCount: row.imageCount,
  }));

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportHref = `/api/export/songs${query({ q: text, category: category?.id, binder, sort: explicitSort, lang: locale })}`;
  const addHref = category ? `/songs/new?category=${category.id}${binder ? `&binder=${binder}` : ""}` : "/songs/new";

  return (
    <>
      <RememberLibraryUrl />
      <PageHeader
        title={t("library.title")}
        description={t("search.tip")}
        actions={
          user.isAdmin ? (
            <ButtonLink href={addHref} icon={<Plus className="size-5" aria-hidden />}>
              {t("library.addSong")}
            </ButtonLink>
          ) : null
        }
      />

      <LibraryFilters categories={categories.data} query={text} selected={category} binder={binder} sort={explicitSort} />

      <div className="mt-5 mb-3 flex min-h-10 flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[15px] text-stone-700" aria-live="polite">
          {songs.data ? (
            <span>
              <span className="font-semibold text-stone-900">
                {t("library.count", { count: total, total: formatNumber(total, locale) })}
              </span>
              {text ? <span className="text-stone-600"> · {t("library.results", { query: text })}</span> : null}
              {total > PAGE_SIZE ? (
                <span className="text-stone-500">
                  {" · "}
                  {t("library.showing", {
                    from: (page - 1) * PAGE_SIZE + 1,
                    to: Math.min(page * PAGE_SIZE, total),
                    total: formatNumber(total, locale),
                  })}
                </span>
              ) : null}
            </span>
          ) : null}
          {songs.isFetching ? <Spinner className="text-stone-500" label={t("common.loading")} /> : null}
        </p>
        {total > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <SortSelect value={sort} query={text} category={category?.id ?? null} binder={binder} />
            {/* A plain link: the file is downloaded, not opened as a page. */}
            <a href={exportHref} download className={buttonClasses({ variant: "secondary", size: "sm", className: "h-10" })}>
              <FileSpreadsheet className="size-4" aria-hidden />
              {t("library.export")}
            </a>
          </div>
        ) : null}
      </div>

      {songs.isError && !songs.data ? (
        <LoadError error={songs.error} retry={() => songs.refetch()} />
      ) : !songs.data ? (
        <SongListSkeleton />
      ) : songsRows.length > 0 ? (
        <>
          <SongResults songs={songsRows} />
          <Pagination
            page={page}
            pageCount={pageCount}
            t={t}
            hrefFor={(target) => libraryHref({ q: text, category: category?.id, binder, sort: explicitSort, page: target })}
          />
        </>
      ) : text ? (
        <EmptyState
          icon={<SearchX />}
          title={
            category
              ? t("library.empty.noResultsInCategory", { query: text, category: category.name })
              : t("library.empty.noResults", { query: text })
          }
          description={t("search.tip")}
          action={
            <>
              {category ? (
                <ButtonLink href={libraryHref({ q: text, sort: explicitSort })} variant="primary">
                  {t("library.empty.searchAll")}
                </ButtonLink>
              ) : null}
              <ButtonLink href={libraryHref({ category: category?.id, binder })} variant="secondary">
                {t("library.empty.clearSearch")}
              </ButtonLink>
            </>
          }
        />
      ) : category ? (
        <EmptyState
          icon={<FolderOpen />}
          title={binder ? t("library.empty.binder", { binder: formatBinder(category.code, binder) }) : t("library.empty.category")}
          action={
            user.isAdmin ? (
              <ButtonLink href={addHref} icon={<Plus className="size-5" aria-hidden />}>
                {t("library.addSong")}
              </ButtonLink>
            ) : null
          }
        />
      ) : (
        <EmptyState
          icon={<LibraryBig />}
          title={t("library.empty.noSongs")}
          description={user.isAdmin ? t("library.empty.noSongsAdmin") : undefined}
          action={
            user.isAdmin ? (
              <ButtonLink href="/songs/new" icon={<Plus className="size-5" aria-hidden />}>
                {t("library.addSong")}
              </ButtonLink>
            ) : null
          }
        />
      )}
    </>
  );
}
