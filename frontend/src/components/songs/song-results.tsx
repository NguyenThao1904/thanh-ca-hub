import type { MouseEvent } from "react";
import { Link, useNavigate } from "react-router";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { FileIndicators } from "./file-indicators";
import { LocationBadge } from "./location-badge";

export type SongRow = {
  id: number;
  songNumber: number | null;
  title: string;
  composer: string | null;
  firstSentence: string | null;
  categoryName: string;
  categoryCode: string;
  binderNumber: number;
  pageNumber: number;
  updatedAt: string;
  hasPdf: boolean;
  imageCount: number;
};

/** Desktop: a table where the whole row opens the song. Phones: compact cards. */
export function SongResults({ songs }: { songs: SongRow[] }) {
  return (
    <>
      <SongTable songs={songs} />
      <SongCards songs={songs} />
    </>
  );
}

function SongTable({ songs }: { songs: SongRow[] }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();

  function openRow(event: MouseEvent, id: number) {
    // Links inside the row handle their own clicks.
    if ((event.target as HTMLElement).closest("a, button")) return;
    const href = `/songs/${id}`;
    if (event.metaKey || event.ctrlKey) {
      window.open(href, "_blank", "noopener");
      return;
    }
    navigate(href);
  }

  return (
    <div className="hidden overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm md:block">
      <table className="w-full border-collapse text-left">
        <thead className="border-b border-stone-200 bg-stone-50 text-xs font-semibold tracking-wide text-stone-600 uppercase">
          <tr>
            <th scope="col" className="w-32 px-4 py-3">
              {t("library.columns.location")}
            </th>
            <th scope="col" className="px-4 py-3">
              {t("library.columns.title")}
            </th>
            <th scope="col" className="w-44 px-4 py-3">
              {t("library.columns.composer")}
            </th>
            <th scope="col" className="hidden w-36 px-4 py-3 xl:table-cell">
              {t("library.columns.category")}
            </th>
            <th scope="col" className="w-32 px-4 py-3">
              {t("library.columns.files")}
            </th>
            <th scope="col" className="hidden w-32 px-4 py-3 2xl:table-cell">
              {t("library.columns.updated")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {songs.map((song) => (
            <tr
              key={song.id}
              onClick={(event) => openRow(event, song.id)}
              className="cursor-pointer align-top transition-colors hover:bg-brand-50/60"
            >
              <td className="px-4 py-3">
                <LocationBadge code={song.categoryCode} binder={song.binderNumber} page={song.pageNumber} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <Link
                    to={`/songs/${song.id}`}
                    className="text-[16px] leading-snug font-semibold text-stone-900 hover:text-brand-800 hover:underline"
                  >
                    {song.title}
                  </Link>
                  {song.songNumber != null ? (
                    <span className="mt-0.5 shrink-0 font-mono text-sm text-stone-500 tabular">#{song.songNumber}</span>
                  ) : null}
                </div>
                {song.firstSentence ? (
                  <p className="mt-0.5 line-clamp-1 text-sm text-stone-600 italic">{song.firstSentence}</p>
                ) : null}
                <p className="mt-0.5 text-sm text-stone-500 xl:hidden">{song.categoryName}</p>
              </td>
              <td className="px-4 py-3 text-[15px] text-stone-700">{song.composer ?? <span className="text-stone-400">—</span>}</td>
              <td className="hidden px-4 py-3 text-[15px] text-stone-700 xl:table-cell">{song.categoryName}</td>
              <td className="px-4 py-3">
                <FileIndicators hasPdf={song.hasPdf} imageCount={song.imageCount} />
              </td>
              <td className="hidden px-4 py-3 text-sm whitespace-nowrap text-stone-600 2xl:table-cell">
                {formatDate(song.updatedAt, locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SongCards({ songs }: { songs: SongRow[] }) {
  const { t } = useI18n();
  return (
    <ul className="space-y-3 md:hidden">
      {songs.map((song) => (
        <li key={song.id}>
          <Link
            to={`/songs/${song.id}`}
            className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-colors active:bg-brand-50"
          >
            <div className="flex items-start justify-between gap-3">
              <LocationBadge code={song.categoryCode} binder={song.binderNumber} page={song.pageNumber} size="lg" />
              <div className="flex items-center gap-2 pt-1">
                <FileIndicators hasPdf={song.hasPdf} imageCount={song.imageCount} />
              </div>
            </div>
            <p className="mt-3 text-lg leading-snug font-semibold text-stone-900">
              {song.title}
              {song.songNumber != null ? (
                <span className="ml-2 font-mono text-sm font-normal text-stone-500 tabular">#{song.songNumber}</span>
              ) : null}
            </p>
            <p className="mt-1 text-[15px] text-stone-700">
              {[song.composer, song.categoryName].filter(Boolean).join(" · ")}
            </p>
            {song.firstSentence ? (
              <p className="mt-1.5 line-clamp-2 text-[15px] text-stone-600 italic">“{song.firstSentence}”</p>
            ) : null}
            {song.hasPdf ? <span className="sr-only">{t("files.pdfAvailable")}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
