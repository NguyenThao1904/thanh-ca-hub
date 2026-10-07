import { CircleAlert, CircleCheck, FileText, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { UploadItem } from "./types";

export function UploadPanel({
  uploads,
  failed,
  busy,
  onRetry,
  onContinue,
}: {
  uploads: UploadItem[];
  failed: boolean;
  busy: boolean;
  onRetry: () => void;
  onContinue: () => void;
}) {
  const { t } = useI18n();

  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border p-4 shadow-sm sm:p-5",
        failed ? "border-red-200 bg-red-50/70" : "border-brand-200 bg-white",
      )}
    >
      <p className="font-semibold text-stone-900">{failed ? t("form.uploadFailedTitle") : t("form.uploadingTitle")}</p>
      {failed ? <p className="mt-1 text-[15px] text-stone-700">{t("form.uploadFailedText")}</p> : null}

      <ul className="mt-3 space-y-3">
        {uploads.map((upload) => (
          <li key={upload.key}>
            <div className="flex items-center gap-2 text-[15px]">
              {upload.kind === "pdf" ? (
                <FileText className="size-4 shrink-0 text-red-700" aria-hidden />
              ) : (
                <ImageIcon className="size-4 shrink-0 text-sky-700" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate text-stone-800">{upload.name}</span>
              {upload.status === "done" ? (
                <CircleCheck className="size-5 shrink-0 text-emerald-700" aria-label={t("form.uploadDone")} />
              ) : upload.status === "error" ? (
                <CircleAlert className="size-5 shrink-0 text-red-700" aria-hidden />
              ) : upload.status === "uploading" ? (
                <span className="w-10 shrink-0 text-right text-sm text-stone-600 tabular">{Math.round(upload.progress * 100)}%</span>
              ) : (
                <Spinner className="shrink-0 text-stone-400" />
              )}
            </div>
            {upload.status === "error" && upload.error ? (
              <p className="mt-1 text-sm font-medium text-red-700">{t(upload.error, { name: upload.name })}</p>
            ) : (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-200">
                <div
                  className={cn("h-full rounded-full transition-[width]", upload.status === "done" ? "bg-emerald-600" : "bg-brand-600")}
                  style={{ width: `${Math.round(upload.progress * 100)}%` }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {failed ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button onClick={onRetry} loading={busy}>
            {t("form.retryUploads")}
          </Button>
          <Button variant="secondary" onClick={onContinue} disabled={busy}>
            {t("form.continueWithout")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
