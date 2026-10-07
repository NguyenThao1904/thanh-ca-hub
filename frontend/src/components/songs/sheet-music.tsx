import { Download, ExternalLink, FileText, Maximize2 } from "lucide-react";
import { useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/plugins/counter.css";
import "yet-another-react-lightbox/styles.css";
import { buttonClasses } from "@/components/ui/button";
import { formatBytes } from "@/lib/files";
import { useI18n } from "@/lib/i18n/client";
import { localeTag } from "@/lib/i18n/config";

type FileInfo = { id: number; fileName: string; sizeBytes: number };

const fileUrl = (id: number) => `/api/files/${id}`;

/** The song's PDF (viewer + buttons) and scanned pages (thumbnails + full-screen zoomable viewer). */
export function SheetMusic({ title, pdf, images }: { title: string; pdf: FileInfo | null; images: FileInfo[] }) {
  const { t, locale } = useI18n();
  const [openIndex, setOpenIndex] = useState(-1);
  const [showPreview, setShowPreview] = useState(true);

  if (!pdf && images.length === 0) {
    return <p className="text-[15px] text-stone-600">{t("song.noFiles")}</p>;
  }

  return (
    <div className="space-y-6">
      {pdf ? (
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
              <FileText className="size-6" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-stone-900">{pdf.fileName}</p>
              <p className="text-sm text-stone-600">{formatBytes(pdf.sizeBytes, localeTag(locale))}</p>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <a
                href={fileUrl(pdf.id)}
                target="_blank"
                rel="noopener"
                className={buttonClasses({ size: "lg", className: "flex-1 sm:flex-none" })}
              >
                <ExternalLink className="size-5" aria-hidden />
                {t("song.viewPdf")}
              </a>
              <a href={`${fileUrl(pdf.id)}?download=1`} className={buttonClasses({ variant: "secondary", size: "lg" })}>
                <Download className="size-5" aria-hidden />
                <span className="sr-only sm:not-sr-only">{t("song.downloadPdf")}</span>
              </a>
            </div>
          </div>

          {/* Phones open the PDF in the browser's own viewer ("View PDF"); larger screens also get an inline preview. */}
          <div className="mt-4 hidden md:block">
            <button
              type="button"
              onClick={() => setShowPreview((value) => !value)}
              className="text-sm font-medium text-brand-700 hover:underline"
              aria-expanded={showPreview}
            >
              {showPreview ? t("song.hidePreview") : t("song.showPreview")}
            </button>
            {showPreview ? (
              <iframe
                src={`${fileUrl(pdf.id)}#view=FitH`}
                title={`${t("song.pdfPreview")}: ${title}`}
                className="mt-2 h-[80vh] w-full rounded-lg border border-stone-200 bg-stone-100"
                loading="lazy"
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {images.length > 0 ? (
        <div>
          <h3 className="mb-3 text-base font-semibold text-stone-900">{t("song.images")}</h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((image, index) => (
              <li key={image.id}>
                <button
                  type="button"
                  onClick={() => setOpenIndex(index)}
                  className="group relative block w-full overflow-hidden rounded-lg border border-stone-200 bg-white text-left shadow-sm hover:border-brand-300 focus-visible:border-brand-500"
                  aria-label={t("song.openImage", { n: index + 1 })}
                >
                  <img
                    src={fileUrl(image.id)}
                    alt={t("song.imageAlt", { title, n: index + 1, total: images.length })}
                    loading="lazy"
                    className="aspect-[1/1.414] w-full bg-white object-contain"
                  />
                  <span className="flex items-center justify-between border-t border-stone-100 px-3 py-2 text-sm font-medium text-stone-700">
                    {t("song.page", { n: index + 1 })}
                    <Maximize2 className="size-4 text-stone-400 group-hover:text-brand-700" aria-hidden />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Lightbox
            open={openIndex >= 0}
            index={Math.max(openIndex, 0)}
            close={() => setOpenIndex(-1)}
            slides={images.map((image, index) => ({
              src: fileUrl(image.id),
              alt: t("song.imageAlt", { title, n: index + 1, total: images.length }),
            }))}
            plugins={[Zoom, Counter]}
            zoom={{ maxZoomPixelRatio: 4, scrollToZoom: true }}
            carousel={{ finite: true }}
            labels={{ Close: t("common.close") }}
          />
        </div>
      ) : null}
    </div>
  );
}
