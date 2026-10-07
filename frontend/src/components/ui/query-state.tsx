import { RotateCcw, SearchX, TriangleAlert } from "lucide-react";
import { isNotFound } from "@/api/client";
import { useI18n } from "@/lib/i18n/client";
import { Button, ButtonLink } from "./button";
import { EmptyState } from "./empty-state";

/** Shown when a page's data could not be loaded: a friendly message and a retry button. */
export function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useI18n();
  if (isNotFound(error)) return <NotFound />;
  return (
    <EmptyState
      icon={<TriangleAlert />}
      title={t("errorPage.title")}
      description={t("errorPage.text")}
      action={
        <>
          <Button onClick={retry} icon={<RotateCcw className="size-5" aria-hidden />}>
            {t("common.retry")}
          </Button>
          <ButtonLink href="/songs" variant="secondary">
            {t("common.goToLibrary")}
          </ButtonLink>
        </>
      }
    />
  );
}

export function NotFound({ title, text }: { title?: string; text?: string }) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={<SearchX />}
      title={title ?? t("notFound.title")}
      description={text ?? t("notFound.text")}
      action={<ButtonLink href="/songs">{t("common.goToLibrary")}</ButtonLink>}
    />
  );
}
