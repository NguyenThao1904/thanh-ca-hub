import { ArrowRight, FileText, FileX, Folders, LibraryBig } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useCurrentUser, useSongs, useStats } from "@/api/queries";
import type { SongListItem } from "@/api/types";
import { HeaderSearch } from "@/components/layout/header-search";
import { LocationBadge } from "@/components/songs/location-badge";
import { Card, CardHeader } from "@/components/ui/card";
import { LoadError } from "@/components/ui/query-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { libraryHref } from "@/lib/library";
import { useTitle } from "@/lib/title";

function StatCard({ label, value, icon, href }: { label: string; value: string | null; icon: ReactNode; href?: string }) {
  const content = (
    <>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-800 [&_svg]:size-6">{icon}</span>
      <span className="min-w-0">
        {value === null ? (
          <Skeleton className="h-8 w-14" />
        ) : (
          <span className="block text-2xl font-semibold text-stone-900 tabular sm:text-3xl">{value}</span>
        )}
        <span className="block text-sm text-stone-600">{label}</span>
      </span>
    </>
  );
  const className = "flex items-center gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm";
  return href ? (
    <Link to={href} className={`${className} hover:border-brand-200 hover:bg-brand-50/40`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function RecentList({ songs, dateField }: { songs: SongListItem[] | undefined; dateField: "createdAt" | "updatedAt" }) {
  const { t, locale } = useI18n();
  if (!songs) {
    return (
      <div className="space-y-3 px-5 py-4" aria-busy>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-6 w-full" />
        ))}
      </div>
    );
  }
  if (songs.length === 0) return <p className="px-5 py-4 text-[15px] text-stone-600">{t("dashboard.nothingYet")}</p>;
  return (
    <ul className="divide-y divide-stone-100">
      {songs.map((song) => (
        <li key={song.id}>
          <Link to={`/songs/${song.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50">
            <LocationBadge code={song.categoryCode} binder={song.binderNumber} page={song.pageNumber} size="sm" />
            <span className="min-w-0 flex-1 truncate font-medium text-stone-900">{song.title}</span>
            <span className="shrink-0 text-sm text-stone-500">{formatDate(song[dateField], locale)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPage() {
  const user = useCurrentUser();
  const { t, locale } = useI18n();
  const stats = useStats();
  const recentlyAdded = useSongs({ sort: "created_desc", pageSize: 6 });
  const recentlyUpdated = useSongs({ sort: "updated_desc", pageSize: 6 });
  useTitle(t("dashboard.title"));

  if (stats.isError) return <LoadError error={stats.error} retry={() => stats.refetch()} />;
  const number = (value: number | undefined) => (value === undefined ? null : formatNumber(value, locale));

  return (
    <>
      <section className="rounded-2xl border border-stone-200 bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-8">
        <p className="text-[15px] text-stone-600">{t("dashboard.greeting", { name: user.displayName })}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">{t("dashboard.searchTitle")}</h1>
        <div className="mt-5 max-w-2xl">
          <HeaderSearch size="lg" />
          <p className="mt-2 text-sm text-stone-500">{t("search.tip")}</p>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("dashboard.totalSongs")} value={number(stats.data?.totalSongs)} icon={<LibraryBig />} href="/songs" />
        <StatCard label={t("dashboard.totalCategories")} value={number(stats.data?.totalCategories)} icon={<Folders />} href="/categories" />
        <StatCard label={t("dashboard.withPdf")} value={number(stats.data?.songsWithPdf)} icon={<FileText />} />
        <StatCard label={t("dashboard.withoutPdf")} value={number(stats.data?.songsWithoutPdf)} icon={<FileX />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t("dashboard.recentlyAdded")}
            actions={
              <Link to={libraryHref({ sort: "created_desc" })} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                {t("dashboard.viewAll")} <ArrowRight className="size-4" aria-hidden />
              </Link>
            }
          />
          <RecentList songs={recentlyAdded.data?.items} dateField="createdAt" />
        </Card>
        <Card>
          <CardHeader
            title={t("dashboard.recentlyUpdated")}
            actions={
              <Link to={libraryHref({ sort: "updated_desc" })} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                {t("dashboard.viewAll")} <ArrowRight className="size-4" aria-hidden />
              </Link>
            }
          />
          <RecentList songs={recentlyUpdated.data?.items} dateField="updatedAt" />
        </Card>
      </div>
    </>
  );
}
