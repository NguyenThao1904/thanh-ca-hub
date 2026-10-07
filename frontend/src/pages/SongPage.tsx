import { MapPin, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { useParams } from "react-router";
import { useCurrentUser, useSong, useSongHistory } from "@/api/queries";
import { AuditList } from "@/components/activity/audit-list";
import { DeleteSongButton } from "@/components/songs/delete-song-button";
import { BackToLibraryLink } from "@/components/songs/library-memory";
import { LocationBadge } from "@/components/songs/location-badge";
import { SheetMusic } from "@/components/songs/sheet-music";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { SongSkeleton } from "@/components/ui/page-skeletons";
import { LoadError, NotFound } from "@/components/ui/query-state";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { formatPage, songLabel } from "@/lib/location";
import { useTitle } from "@/lib/title";
import { parseWholeNumber } from "@/lib/utils";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-3 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-stone-500">{label}</dt>
      <dd className="mt-0.5 text-[16px] text-stone-900 sm:mt-0">{children}</dd>
    </div>
  );
}

export function SongPage() {
  const user = useCurrentUser();
  const { t, locale } = useI18n();
  const songId = parseWholeNumber(useParams().id);
  const { data: song, error, isPending, refetch } = useSong(songId);
  const history = useSongHistory(songId ?? 0, user.isAdmin && songId != null);
  useTitle(song ? `${song.location} · ${song.title}` : null);

  const notFound = <NotFound title={t("song.notFoundTitle")} text={t("song.notFoundText")} />;
  if (songId == null) return notFound;
  if (isPending) return <SongSkeleton />;
  if (error) return <LoadError error={error} retry={() => refetch()} />;
  if (!song) return notFound;

  const byUser = (date: string, name: string | null) =>
    name ? t("song.byUser", { date: formatDate(date, locale), name }) : formatDate(date, locale);

  return (
    <article>
      <BackToLibraryLink label={t("song.back")} />

      <header className="mt-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
        <p className="flex items-center gap-1.5 text-sm font-medium text-stone-600">
          <MapPin className="size-4 text-gold-600" aria-hidden />
          {t("song.location")}
        </p>
        <div className="mt-2">
          <LocationBadge code={song.category.code} binder={song.binderNumber} page={song.pageNumber} size="xl" />
        </div>
        <p className="mt-3 text-[15px] font-medium text-stone-700">
          {t("song.findIt", {
            category: song.category.name,
            code: song.category.code,
            binder: song.binderNumber,
            page: formatPage(song.pageNumber),
          })}
        </p>

        <h1 className="mt-5 text-2xl leading-tight font-semibold tracking-tight text-stone-900 sm:text-3xl">
          {song.title}
          {song.songNumber != null ? (
            <span className="ml-3 align-middle font-mono text-lg font-normal text-stone-500 tabular">#{song.songNumber}</span>
          ) : null}
        </h1>
        {song.composer ? <p className="mt-1 text-lg text-stone-700">{song.composer}</p> : null}

        {user.isAdmin ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href={`/songs/${song.id}/edit`} variant="primary" icon={<Pencil className="size-5" aria-hidden />}>
              {t("song.edit")}
            </ButtonLink>
            <DeleteSongButton
              songId={song.id}
              label={songLabel({ songNumber: song.songNumber, title: song.title, location: song.location })}
            />
          </div>
        ) : null}
      </header>

      <Card className="mt-6">
        <dl className="divide-y divide-stone-100 px-5 py-2">
          {song.songNumber != null ? <Detail label={t("song.number")}>#{song.songNumber}</Detail> : null}
          <Detail label={t("song.title")}>{song.title}</Detail>
          <Detail label={t("song.composer")}>{song.composer ?? <span className="text-stone-400">—</span>}</Detail>
          <Detail label={t("song.firstSentence")}>
            {song.firstSentence ? <span className="italic">“{song.firstSentence}”</span> : <span className="text-stone-400">—</span>}
          </Detail>
          <Detail label={t("song.category")}>
            {song.category.name} <span className="font-mono text-stone-500">({song.category.code})</span>
          </Detail>
          {song.notes ? (
            <Detail label={t("song.notes")}>
              <span className="whitespace-pre-line">{song.notes}</span>
            </Detail>
          ) : null}
          <Detail label={t("song.added")}>{byUser(song.createdAt, song.createdByName)}</Detail>
          <Detail label={t("song.updated")}>{byUser(song.updatedAt, song.updatedByName)}</Detail>
        </dl>
      </Card>

      <Card className="mt-6">
        <CardHeader title={t("song.sheetMusic")} />
        <div className="p-5">
          <SheetMusic
            title={song.title}
            pdf={song.pdf ? { id: song.pdf.id, fileName: song.pdf.fileName, sizeBytes: song.pdf.sizeBytes } : null}
            images={song.images.map((image) => ({ id: image.id, fileName: image.fileName, sizeBytes: image.sizeBytes }))}
          />
        </div>
      </Card>

      {user.isAdmin ? (
        <Card className="mt-6">
          <CardHeader title={t("song.history")} />
          <div className="p-5">
            {history.data && history.data.length > 0 ? (
              <AuditList entries={history.data} />
            ) : history.data ? (
              <p className="text-[15px] text-stone-600">{t("song.historyEmpty")}</p>
            ) : (
              <p className="text-[15px] text-stone-500">{t("common.loading")}</p>
            )}
          </div>
        </Card>
      ) : null}
    </article>
  );
}
