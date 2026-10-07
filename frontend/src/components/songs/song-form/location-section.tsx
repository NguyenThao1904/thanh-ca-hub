import { CircleAlert, CircleCheck } from "lucide-react";
import { Link } from "react-router";
import { Field, Input, Select } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n/client";
import { binderNumbers } from "@/lib/location";
import { LocationBadge } from "../location-badge";
import type { CategoryOption, FormValues, LocationStatus } from "./types";

type Props = {
  categories: CategoryOption[];
  values: FormValues;
  errors: Record<string, string>;
  disabled: boolean;
  category: CategoryOption | null;
  binderNumber: number | null;
  pageNumber: number | null;
  /** Result of the live check, if it matches the current inputs. */
  status: LocationStatus | null;
  checking: boolean;
  onCategoryChange: (categoryId: string) => void;
  onChange: (field: "binderNumber" | "pageNumber", value: string) => void;
  onUsePage: (page: number) => void;
};

export function LocationSection({
  categories,
  values,
  errors,
  disabled,
  category,
  binderNumber,
  pageNumber,
  status,
  checking,
  onCategoryChange,
  onChange,
  onUsePage,
}: Props) {
  const { t } = useI18n();
  const complete = category && binderNumber && pageNumber;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Field id="song-categoryId" label={t("form.category")} required error={errors.categoryId}>
          {(control) => (
            <Select {...control} value={values.categoryId} onChange={(event) => onCategoryChange(event.target.value)} disabled={disabled}>
              <option value="">{t("form.chooseCategory")}</option>
              {categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.code} — {option.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field id="song-binderNumber" label={t("form.binder")} required error={errors.binderNumber}>
          {(control) => (
            <Select
              {...control}
              value={values.binderNumber}
              onChange={(event) => onChange("binderNumber", event.target.value)}
              disabled={disabled || !category}
            >
              {!category ? <option value="">—</option> : null}
              {category
                ? binderNumbers(category.binderCount).map((number) => (
                    <option key={number} value={number}>
                      {category.binderCount > 1 ? t("form.binderOf", { binder: number, count: category.binderCount }) : number}
                    </option>
                  ))
                : null}
            </Select>
          )}
        </Field>

        <Field id="song-pageNumber" label={t("form.page")} required error={errors.pageNumber}>
          {(control) => (
            <Input
              {...control}
              value={values.pageNumber}
              onChange={(event) => onChange("pageNumber", event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="01"
              disabled={disabled}
            />
          )}
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-brand-50/70 px-4 py-3 ring-1 ring-brand-100">
        <span className="text-sm font-medium text-stone-600">{t("form.locationPreview")}</span>
        {complete ? (
          <LocationBadge code={category.code} binder={binderNumber} page={pageNumber} size="lg" />
        ) : (
          <span className="font-mono text-lg text-stone-400">—</span>
        )}

        <div className="min-w-0 flex-1 text-[15px]" aria-live="polite">
          {complete && checking ? (
            <span className="inline-flex items-center gap-2 text-stone-600">
              <Spinner /> {t("form.checking")}
            </span>
          ) : complete && status?.state === "available" ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
              <CircleCheck className="size-5" aria-hidden /> {t("form.locationAvailable")}
            </span>
          ) : complete && status?.state === "taken" ? (
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-red-700">
              <CircleAlert className="size-5" aria-hidden />
              <span>
                {t("form.locationTaken", { title: status.takenBy.title })}{" "}
                <Link to={`/songs/${status.takenBy.id}`} target="_blank" className="underline">
                  {t("form.openExisting")}
                </Link>
              </span>
            </span>
          ) : null}
        </div>

        {status && (status.state === "taken" || !pageNumber) && status.nextFreePage !== pageNumber ? (
          <p className="flex w-full flex-wrap items-center gap-2 text-sm text-stone-700">
            {t("form.nextFree", { page: String(status.nextFreePage).padStart(2, "0") })}
            <button
              type="button"
              onClick={() => onUsePage(status.nextFreePage)}
              className="rounded-md bg-white px-2.5 py-1 font-medium text-brand-800 ring-1 ring-brand-200 hover:bg-brand-50"
              disabled={disabled}
            >
              {t("form.useNextFree", { page: status.nextFreePage })}
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );
}
