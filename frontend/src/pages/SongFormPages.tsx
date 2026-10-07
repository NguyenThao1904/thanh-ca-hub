import { ArrowLeft } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router";
import { useCategories, useSong } from "@/api/queries";
import { BackToLibraryLink } from "@/components/songs/library-memory";
import { LocationBadge } from "@/components/songs/location-badge";
import { SongForm } from "@/components/songs/song-form/song-form";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/page-skeletons";
import { LoadError, NotFound } from "@/components/ui/query-state";
import { useI18n } from "@/lib/i18n/client";
import { useTitle } from "@/lib/title";
import { parseWholeNumber } from "@/lib/utils";

export function NewSongPage() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const categories = useCategories();
  useTitle(t("form.addTitle"));

  if (categories.isPending) return <PageSkeleton />;
  if (categories.isError) return <LoadError error={categories.error} retry={() => categories.refetch()} />;

  // Coming from a filtered library view: start in that category and binder.
  const category = categories.data.find((item) => item.id === parseWholeNumber(searchParams.get("category")));
  const binder = parseWholeNumber(searchParams.get("binder"));

  return (
    <>
      <BackToLibraryLink label={t("song.back")} />
      <div className="mt-3">
        <PageHeader title={t("form.addTitle")} />
      </div>
      <SongForm
        categories={categories.data.map(({ id, name, code, binderCount }) => ({ id, name, code, binderCount }))}
        initial={{
          categoryId: category ? String(category.id) : "",
          binderNumber: category ? String(binder && binder <= category.binderCount ? binder : 1) : "",
          pageNumber: "",
          songNumber: "",
          title: "",
          composer: "",
          firstSentence: "",
          notes: "",
        }}
        existingImages={[]}
        existingPdf={null}
      />
    </>
  );
}

export function EditSongPage() {
  const { t } = useI18n();
  const songId = parseWholeNumber(useParams().id);
  const categories = useCategories();
  const song = useSong(songId);
  useTitle(t("form.editTitle"));

  if (songId == null) return <NotFound title={t("song.notFoundTitle")} text={t("song.notFoundText")} />;
  if (categories.isPending || song.isPending) return <PageSkeleton />;
  if (categories.isError) return <LoadError error={categories.error} retry={() => categories.refetch()} />;
  if (song.isError) return <LoadError error={song.error} retry={() => song.refetch()} />;

  const data = song.data;
  return (
    <>
      <Link
        to={`/songs/${data.id}`}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg pr-3 text-[15px] font-medium text-stone-600 hover:text-stone-900"
      >
        <ArrowLeft className="size-5" aria-hidden />
        {t("common.back")}
      </Link>
      <div className="mt-3">
        <PageHeader
          title={t("form.editTitle")}
          description={
            <span className="flex flex-wrap items-center gap-2 text-stone-700">
              <LocationBadge code={data.category.code} binder={data.binderNumber} page={data.pageNumber} size="sm" />
              <span className="font-medium">{data.title}</span>
            </span>
          }
        />
      </div>
      <SongForm
        // A fresh form for each song. Reloads of the same song (e.g. when the window regains
        // focus during an upload) must not reset what the admin is doing.
        key={data.id}
        songId={data.id}
        categories={categories.data.map(({ id, name, code, binderCount }) => ({ id, name, code, binderCount }))}
        initial={{
          categoryId: String(data.category.id),
          binderNumber: String(data.binderNumber),
          pageNumber: String(data.pageNumber),
          songNumber: data.songNumber != null ? String(data.songNumber) : "",
          title: data.title,
          composer: data.composer ?? "",
          firstSentence: data.firstSentence ?? "",
          notes: data.notes ?? "",
        }}
        existingImages={data.images.map((image) => ({ id: image.id, fileName: image.fileName }))}
        existingPdf={data.pdf ? { id: data.pdf.id, fileName: data.pdf.fileName, sizeBytes: data.pdf.sizeBytes } : null}
      />
    </>
  );
}
