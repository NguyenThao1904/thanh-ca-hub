import { FileText, ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/client";

export function FileIndicators({ hasPdf, imageCount }: { hasPdf: boolean; imageCount: number }) {
  const { t } = useI18n();
  if (!hasPdf && imageCount === 0) return <span className="text-stone-400" aria-hidden>—</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {hasPdf ? (
        <Badge tone="pdf">
          <FileText className="size-3.5" aria-hidden />
          {t("files.pdf")}
        </Badge>
      ) : null}
      {imageCount > 0 ? (
        <Badge tone="image">
          <ImageIcon className="size-3.5" aria-hidden />
          {t("files.images", { count: imageCount })}
        </Badge>
      ) : null}
    </span>
  );
}
