import { ArrowLeft, ArrowRight, FileText, ImagePlus, RotateCcw, Trash2, Upload } from "lucide-react";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { formatBytes, IMAGE_ACCEPT, MAX_PDF_BYTES, PDF_ACCEPT } from "@/lib/files";
import { useI18n } from "@/lib/i18n/client";
import { localeTag } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";
import type { ImageItem, PdfState } from "./types";

type Props = {
  disabled: boolean;
  images: ImageItem[];
  pdf: PdfState;
  messages: string[];
  onAddImages: (files: File[]) => void;
  onMoveImage: (index: number, direction: -1 | 1) => void;
  onRemoveImage: (index: number) => void;
  onChoosePdf: (file: File) => void;
  onRemovePdf: () => void;
  onUndoPdf: () => void;
};

export function FilesSection({
  disabled,
  images,
  pdf,
  messages,
  onAddImages,
  onMoveImage,
  onRemoveImage,
  onChoosePdf,
  onRemovePdf,
  onUndoPdf,
}: Props) {
  const { t, locale } = useI18n();
  const imageInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const tag = localeTag(locale);

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files);
    const pdfFile = files.find((file) => file.name.toLowerCase().endsWith(".pdf"));
    if (pdfFile) onChoosePdf(pdfFile);
    const others = files.filter((file) => file !== pdfFile);
    if (others.length > 0) onAddImages(others);
  }

  return (
    <div
      className="space-y-6"
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {/* PDF */}
      <section aria-labelledby="pdf-heading">
        <h3 id="pdf-heading" className="text-sm font-medium text-stone-800">
          {t("form.pdf")}
        </h3>
        <p className="mt-0.5 text-sm text-stone-600">{t("form.pdfHelp", { size: formatBytes(MAX_PDF_BYTES, tag) })}</p>

        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3">
          {pdf.replacement || pdf.existing ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700">
                <FileText className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate font-medium text-stone-900", pdf.remove && "line-through opacity-60")}>
                  {pdf.replacement ? pdf.replacement.name : pdf.existing?.fileName}
                  {pdf.replacement ? (
                    <Badge tone="brand" className="ml-2 align-middle">
                      {t("form.newBadge")}
                    </Badge>
                  ) : null}
                </p>
                <p className="text-sm text-stone-600">
                  {pdf.remove
                    ? t("form.pdfWillBeRemoved")
                    : pdf.replacement && pdf.existing
                      ? t("form.pdfWillBeReplaced")
                      : formatBytes(pdf.replacement?.size ?? pdf.existing?.sizeBytes ?? 0, tag)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {pdf.remove || pdf.replacement ? (
                  <Button variant="secondary" size="sm" onClick={onUndoPdf} disabled={disabled} icon={<RotateCcw className="size-4" aria-hidden />}>
                    {t("form.undo")}
                  </Button>
                ) : null}
                {!pdf.remove ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => pdfInput.current?.click()}
                      disabled={disabled}
                      icon={<Upload className="size-4" aria-hidden />}
                    >
                      {t("form.replacePdf")}
                    </Button>
                    {pdf.existing && !pdf.replacement ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onRemovePdf}
                        disabled={disabled}
                        icon={<Trash2 className="size-4 text-red-700" aria-hidden />}
                      >
                        {t("form.removePdf")}
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => pdfInput.current?.click()} disabled={disabled} icon={<Upload className="size-5" aria-hidden />}>
              {t("form.choosePdf")}
            </Button>
          )}
        </div>
        <input
          ref={pdfInput}
          type="file"
          accept={PDF_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onChoosePdf(file);
            event.target.value = "";
          }}
        />
      </section>

      {/* Images */}
      <section aria-labelledby="images-heading">
        <h3 id="images-heading" className="text-sm font-medium text-stone-800">
          {t("form.images")}
        </h3>
        <p className="mt-0.5 text-sm text-stone-600">{t("form.imagesHelp")}</p>

        <div
          className={cn(
            "mt-3 rounded-xl border-2 border-dashed p-3 transition-colors",
            dragging ? "border-brand-400 bg-brand-50" : "border-stone-200 bg-stone-50/60",
          )}
        >
          {images.length > 0 ? (
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {images.map((image, index) => (
                <li key={image.key} className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
                  <img src={image.src} alt="" className="aspect-[1/1.414] w-full bg-white object-contain" />
                  <div className="flex items-center justify-between gap-1 border-t border-stone-100 px-2 py-1.5">
                    <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-stone-700">
                      {t("song.page", { n: index + 1 })}
                      {image.kind === "new" ? <Badge tone="brand">{t("form.newBadge")}</Badge> : null}
                    </span>
                    <span className="flex shrink-0">
                      <IconButton label={t("form.moveEarlier")} onClick={() => onMoveImage(index, -1)} disabled={disabled || index === 0}>
                        <ArrowLeft className="size-4" />
                      </IconButton>
                      <IconButton
                        label={t("form.moveLater")}
                        onClick={() => onMoveImage(index, 1)}
                        disabled={disabled || index === images.length - 1}
                      >
                        <ArrowRight className="size-4" />
                      </IconButton>
                      <IconButton label={t("form.removeImage")} onClick={() => onRemoveImage(index)} disabled={disabled} danger>
                        <Trash2 className="size-4" />
                      </IconButton>
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-1 pb-1 text-sm text-stone-500">{t("form.noImages")}</p>
          )}
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => imageInput.current?.click()}
            disabled={disabled}
            icon={<ImagePlus className="size-5" aria-hidden />}
          >
            {t("form.addImages")}
          </Button>
        </div>
        <input
          ref={imageInput}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length > 0) onAddImages(files);
            event.target.value = "";
          }}
        />
      </section>

      {messages.length > 0 ? (
        <div className="space-y-1" role="alert">
          {messages.map((message, index) => (
            <FieldError key={index}>{message}</FieldError>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100 disabled:opacity-30",
        danger && "text-red-700 hover:bg-red-50",
      )}
    >
      {children}
    </button>
  );
}
