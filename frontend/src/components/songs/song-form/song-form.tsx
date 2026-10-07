import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { api, errorOf, query, type ActionError } from "@/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { keys, useRefreshData } from "@/api/queries";
import type { FileChanges, LocationCheck, SongDetail, SongInput } from "@/api/types";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, FormAlert, Input, Textarea } from "@/components/ui/field";
import { checkFile, formatBytes, MAX_IMAGES_PER_SONG } from "@/lib/files";
import { useI18n } from "@/lib/i18n/client";
import { localeTag } from "@/lib/i18n/config";
import { prepareImage, UploadError, uploadFile } from "@/lib/upload";
import { parseWholeNumber } from "@/lib/utils";
import { FilesSection } from "./files-section";
import { LocationSection } from "./location-section";
import type { CategoryOption, FormValues, ImageItem, LocationStatus, PdfState, UploadItem } from "./types";
import { UploadPanel } from "./upload-panel";

type Props = {
  songId?: number;
  categories: CategoryOption[];
  initial: FormValues;
  existingImages: { id: number; fileName: string }[];
  existingPdf: PdfState["existing"];
};

type Phase = "editing" | "saving" | "uploading" | "upload-failed" | "done";

const FIELD_ORDER = ["categoryId", "binderNumber", "pageNumber", "title", "songNumber", "composer", "firstSentence", "notes"];

function toInput(values: FormValues): SongInput {
  const songNumber = values.songNumber.trim();
  return {
    categoryId: parseWholeNumber(values.categoryId),
    binderNumber: parseWholeNumber(values.binderNumber),
    pageNumber: parseWholeNumber(values.pageNumber),
    // Sent as typed, so the server can explain an invalid number.
    songNumber: songNumber ? (parseWholeNumber(songNumber) ?? songNumber) : null,
    title: values.title,
    composer: values.composer,
    firstSentence: values.firstSentence,
    notes: values.notes,
  };
}

let keyCounter = 0;
const newKey = () => `new-${Date.now()}-${keyCounter++}`;

export function SongForm({ songId, categories, initial, existingImages, existingPdf }: Props) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const refreshData = useRefreshData();
  const queryClient = useQueryClient();
  const isEdit = songId != null;
  // The song as last returned by the server, shown at once after saving.
  const latest = useRef<SongDetail | null>(null);

  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<ActionError | null>(null);
  const [pageTouched, setPageTouched] = useState(isEdit || initial.pageNumber !== "");
  const [status, setStatus] = useState<LocationStatus | null>(null);

  const [images, setImages] = useState<ImageItem[]>(() =>
    existingImages.map((image) => ({
      key: `existing-${image.id}`,
      kind: "existing",
      id: image.id,
      name: image.fileName,
      src: `/api/files/${image.id}`,
    })),
  );
  const [removedImageIds, setRemovedImageIds] = useState<number[]>([]);
  const [pdf, setPdf] = useState<PdfState>({ existing: existingPdf, remove: false, replacement: null });
  const [fileMessages, setFileMessages] = useState<string[]>([]);

  const [phase, setPhase] = useState<Phase>("editing");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  // The song exists once it has been saved (always, when editing).
  const [savedSongId, setSavedSongId] = useState<number | null>(songId ?? null);
  const [savedFields, setSavedFields] = useState(() => (isEdit ? JSON.stringify(toInput(initial)) : ""));

  const busy = phase === "saving" || phase === "uploading" || phase === "done";
  const category = categories.find((option) => String(option.id) === values.categoryId) ?? null;
  const binderNumber = parseWholeNumber(values.binderNumber);
  const pageNumber = parseWholeNumber(values.pageNumber);
  const locationKey = category && binderNumber ? `${category.id}-${binderNumber}-${pageNumber ?? ""}` : null;
  const currentStatus = status && status.key === locationKey ? status : null;

  const onLocationChecked = useEffectEvent((key: string, checkedPage: number | null, result: LocationCheck) => {
    if (!pageTouched && checkedPage !== result.nextFreePage) {
      // New song: suggest the next free page of the chosen binder.
      setValues((current) => ({ ...current, pageNumber: String(result.nextFreePage) }));
      return;
    }
    setStatus(
      result.takenBy
        ? { key, state: "taken", takenBy: result.takenBy, nextFreePage: result.nextFreePage }
        : { key, state: "available", nextFreePage: result.nextFreePage },
    );
  });

  // Live location check: is it free, and which page is next in this binder?
  useEffect(() => {
    if (!category || !binderNumber || (pageNumber != null && (pageNumber < 1 || pageNumber > 999))) return;
    const controller = new AbortController();
    const key = `${category.id}-${binderNumber}-${pageNumber ?? ""}`;
    const timer = window.setTimeout(async () => {
      try {
        const result = await api<LocationCheck>(
          `/songs/location-check${query({
            categoryId: category.id,
            binderNumber,
            pageNumber,
            excludeSongId: savedSongId,
          })}`,
          { signal: controller.signal },
        );
        onLocationChecked(key, pageNumber, result);
      } catch {
        // The check is only a convenience; saving validates again.
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [category, binderNumber, pageNumber, savedSongId]);

  // Free the memory of local image previews.
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(
    () => () => {
      for (const image of imagesRef.current) if (image.kind === "new") URL.revokeObjectURL(image.src);
    },
    [],
  );

  // Warn before closing the tab in the middle of saving or uploading.
  useEffect(() => {
    if (!busy || phase === "done") return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy, phase]);

  function clearErrors(...fields: string[]) {
    setErrors((current) => {
      if (!fields.some((field) => field in current)) return current;
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });
  }

  function setField(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    clearErrors(field);
  }

  function onCategoryChange(categoryId: string) {
    const next = categories.find((option) => String(option.id) === categoryId);
    setValues((current) => {
      const binder = parseWholeNumber(current.binderNumber);
      return {
        ...current,
        categoryId,
        binderNumber: next ? String(binder && binder <= next.binderCount ? binder : 1) : "",
      };
    });
    clearErrors("categoryId", "binderNumber");
  }

  function onLocationChange(field: "binderNumber" | "pageNumber", value: string) {
    if (field === "pageNumber") setPageTouched(true);
    setField(field, value);
  }

  // ---- Files ------------------------------------------------------------

  function addImages(files: File[]) {
    const messages: string[] = [];
    const accepted: File[] = [];
    for (const file of files) {
      const problem = checkFile(file, "image");
      if (problem?.problem === "type") messages.push(t("errors.imageType", { name: file.name }));
      else if (problem?.problem === "size")
        messages.push(t("errors.fileTooLarge", { name: file.name, size: formatBytes(problem.maxBytes, localeTag(locale)) }));
      else accepted.push(file);
    }
    accepted.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    const room = Math.max(0, MAX_IMAGES_PER_SONG - images.length);
    const added: ImageItem[] = accepted.slice(0, room).map((file) => ({
      key: newKey(),
      kind: "new",
      file,
      name: file.name,
      src: URL.createObjectURL(file),
    }));
    setImages((current) => [...current, ...added]);
    setFileMessages(messages);
  }

  function moveImage(index: number, direction: -1 | 1) {
    setImages((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeImage(index: number) {
    const image = images[index];
    if (!image) return;
    if (image.kind === "existing") setRemovedImageIds((ids) => [...ids, image.id]);
    else URL.revokeObjectURL(image.src);
    setImages((current) => current.filter((item) => item.key !== image.key));
    setUploads((current) => current.filter((upload) => upload.key !== image.key));
  }

  function choosePdf(file: File) {
    const problem = checkFile(file, "pdf");
    if (problem) {
      setFileMessages([
        problem.problem === "type"
          ? t("errors.pdfType", { name: file.name })
          : t("errors.fileTooLarge", { name: file.name, size: formatBytes(problem.maxBytes, localeTag(locale)) }),
      ]);
      return;
    }
    setFileMessages([]);
    setPdf((current) => ({ ...current, replacement: file, remove: false }));
    setUploads((current) => current.filter((upload) => upload.key !== "pdf"));
  }

  // ---- Saving -----------------------------------------------------------

  function focusFirstError(fieldErrors: Record<string, string>) {
    const first = FIELD_ORDER.find((field) => fieldErrors[field]);
    if (first) document.getElementById(`song-${first}`)?.focus();
  }

  function showServerError(error: ActionError) {
    setFormError(error);
    if (error.fieldErrors) {
      const translated: Record<string, string> = {};
      for (const [field, key] of Object.entries(error.fieldErrors)) translated[field] = t(key, error.params);
      setErrors(translated);
      focusFirstError(translated);
    }
  }

  /** The upload list for everything new in the form, keeping files already uploaded. */
  function uploadQueue(): UploadItem[] {
    const previous = new Map(uploads.map((upload) => [upload.key, upload]));
    const queue: UploadItem[] = [];
    if (pdf.replacement) {
      const done = previous.get("pdf");
      queue.push(
        done?.status === "done" && done.file === pdf.replacement
          ? done
          : { key: "pdf", kind: "pdf", name: pdf.replacement.name, file: pdf.replacement, progress: 0, status: "pending" },
      );
    }
    for (const image of images) {
      if (image.kind !== "new") continue;
      const done = previous.get(image.key);
      queue.push(
        done?.status === "done" ? done : { key: image.key, kind: "image", name: image.name, file: image.file, progress: 0, status: "pending" },
      );
    }
    return queue;
  }

  async function runUploads(queue: UploadItem[]) {
    const results = queue.map((item) => (item.status === "done" ? item : { ...item, status: "pending" as const, progress: 0, error: undefined }));
    setUploads([...results]);
    let next = 0;

    async function worker() {
      while (next < results.length) {
        const index = next++;
        const item = results[index];
        if (item.status === "done") continue;
        results[index] = { ...item, status: "uploading", progress: 0 };
        setUploads([...results]);
        try {
          const file = item.kind === "image" ? await prepareImage(item.file) : item.file;
          const upload = await uploadFile(file, item.kind, (fraction) => {
            results[index] = { ...results[index], progress: fraction };
            setUploads([...results]);
          });
          results[index] = { ...results[index], status: "done", progress: 1, uploadId: upload.id };
        } catch (error) {
          const reason = error instanceof UploadError ? error.reason : "network";
          results[index] = {
            ...results[index],
            status: "error",
            error: reason === "session" ? "errors.sessionExpired" : item.kind === "pdf" ? "errors.uploadPdf" : "errors.uploadImage",
          };
        }
        setUploads([...results]);
      }
    }

    await Promise.all([worker(), worker()]);
    return results;
  }

  /** Attaches uploaded files, removals and the image order to the song (one transaction on the server). */
  async function attachFiles(targetSongId: number, finished: UploadItem[]) {
    const byKey = new Map(finished.map((upload) => [upload.key, upload]));
    const imagePayload: NonNullable<FileChanges["images"]> = [];
    for (const image of images) {
      if (image.kind === "existing") {
        imagePayload.push({ id: image.id });
        continue;
      }
      const upload = byKey.get(image.key);
      if (upload?.status === "done" && upload.uploadId != null) imagePayload.push({ uploadId: upload.uploadId });
    }

    const pdfUpload = byKey.get("pdf");
    const pdfPayload: FileChanges["pdf"] =
      pdf.replacement && pdfUpload?.status === "done" && pdfUpload.uploadId != null
        ? { uploadId: pdfUpload.uploadId }
        : pdf.remove
          ? { remove: true }
          : null;

    const originalOrder = existingImages.map((image) => image.id).filter((id) => !removedImageIds.includes(id));
    const keptOrder = images.flatMap((image) => (image.kind === "existing" ? [image.id] : []));
    const imagesChanged =
      removedImageIds.length > 0 ||
      imagePayload.some((image) => "uploadId" in image) ||
      keptOrder.join(",") !== originalOrder.join(",");

    if (!imagesChanged && !pdfPayload) return true;

    setPhase("saving");
    try {
      latest.current = await api<SongDetail>(`/songs/${targetSongId}/files`, {
        method: "PUT",
        body: { images: imagesChanged ? imagePayload : null, removeImageIds: removedImageIds, pdf: pdfPayload } satisfies FileChanges,
      });
      return true;
    } catch (error) {
      showServerError(errorOf(error));
      setPhase("editing");
      return false;
    }
  }

  function finish(targetSongId: number) {
    setPhase("done");
    toast.success(isEdit ? t("form.saved") : t("form.created"));
    if (latest.current?.id === targetSongId) queryClient.setQueryData(keys.song(targetSongId), latest.current);
    void refreshData();
    navigate(`/songs/${targetSongId}`);
  }

  async function uploadAndFinish(targetSongId: number) {
    const queue = uploadQueue();
    let finished = queue;
    if (queue.some((upload) => upload.status !== "done")) {
      setPhase("uploading");
      finished = await runUploads(queue);
      if (finished.some((upload) => upload.status === "error")) {
        setPhase("upload-failed");
        return;
      }
    }
    if (await attachFiles(targetSongId, finished)) finish(targetSongId);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    setErrors({});

    const input = toInput(values);
    let targetSongId = savedSongId;
    const fields = JSON.stringify(input);
    if (targetSongId == null || fields !== savedFields) {
      setPhase("saving");
      try {
        const saved =
          targetSongId == null
            ? await api<SongDetail>("/songs", { method: "POST", body: input })
            : await api<SongDetail>(`/songs/${targetSongId}`, { method: "PUT", body: input });
        latest.current = saved;
        targetSongId = saved.id;
        setSavedSongId(saved.id);
        setSavedFields(fields);
      } catch (error) {
        showServerError(errorOf(error));
        setPhase("editing");
        return;
      }
    }

    await uploadAndFinish(targetSongId);
  }

  async function continueWithoutFailed() {
    if (savedSongId == null) return;
    if (await attachFiles(savedSongId, uploads)) finish(savedSongId);
  }

  const cancelHref = savedSongId != null ? `/songs/${savedSongId}` : "/songs";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {formError ? (
        <FormAlert
          action={
            formError.href ? (
              <Link to={formError.href} target="_blank" className="text-sm font-semibold underline">
                {t("form.openExisting")}
              </Link>
            ) : null
          }
        >
          {t(formError.message, formError.params)}
        </FormAlert>
      ) : null}

      <Card>
        <CardHeader title={t("form.locationSection")} description={t("form.locationHelp")} />
        <div className="p-5">
          <LocationSection
            categories={categories}
            values={values}
            errors={errors}
            disabled={busy}
            category={category}
            binderNumber={binderNumber}
            pageNumber={pageNumber}
            status={currentStatus}
            checking={Boolean(locationKey && pageNumber && !currentStatus)}
            onCategoryChange={onCategoryChange}
            onChange={onLocationChange}
            onUsePage={(page) => {
              setPageTouched(true);
              setField("pageNumber", String(page));
            }}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title={t("form.infoSection")} />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field id="song-title" label={t("form.title")} required error={errors.title} className="sm:col-span-2">
            {(control) => (
              <Input {...control} value={values.title} onChange={(event) => setField("title", event.target.value)} maxLength={200} disabled={busy} />
            )}
          </Field>
          <Field id="song-songNumber" label={t("form.songNumber")} optionalText={t("form.optional")} hint={t("form.songNumberHelp")} error={errors.songNumber}>
            {(control) => (
              <Input
                {...control}
                value={values.songNumber}
                onChange={(event) => setField("songNumber", event.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="off"
                disabled={busy}
              />
            )}
          </Field>
          <Field id="song-composer" label={t("form.composer")} optionalText={t("form.optional")} error={errors.composer}>
            {(control) => (
              <Input {...control} value={values.composer} onChange={(event) => setField("composer", event.target.value)} maxLength={200} disabled={busy} />
            )}
          </Field>
          <Field id="song-firstSentence" label={t("form.firstSentence")} optionalText={t("form.optional")} error={errors.firstSentence} className="sm:col-span-2">
            {(control) => (
              <Textarea
                {...control}
                rows={2}
                className="min-h-0"
                value={values.firstSentence}
                onChange={(event) => setField("firstSentence", event.target.value)}
                maxLength={500}
                disabled={busy}
              />
            )}
          </Field>
          <Field id="song-notes" label={t("form.notes")} optionalText={t("form.optional")} error={errors.notes} className="sm:col-span-2">
            {(control) => (
              <Textarea {...control} rows={3} value={values.notes} onChange={(event) => setField("notes", event.target.value)} maxLength={2000} disabled={busy} />
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={t("form.filesSection")} />
        <div className="p-5">
          <FilesSection
            disabled={busy}
            images={images}
            pdf={pdf}
            messages={fileMessages}
            onAddImages={addImages}
            onMoveImage={moveImage}
            onRemoveImage={removeImage}
            onChoosePdf={choosePdf}
            onRemovePdf={() => setPdf((current) => ({ ...current, remove: true, replacement: null }))}
            onUndoPdf={() => {
              setPdf((current) => ({ ...current, remove: false, replacement: null }));
              setUploads((current) => current.filter((upload) => upload.key !== "pdf"));
            }}
          />
        </div>
      </Card>

      {uploads.length > 0 && (phase === "uploading" || phase === "upload-failed") ? (
        <UploadPanel
          uploads={uploads}
          failed={phase === "upload-failed"}
          busy={busy}
          onRetry={() => savedSongId != null && uploadAndFinish(savedSongId)}
          onContinue={continueWithoutFailed}
        />
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col-reverse gap-2 border-t border-stone-200 bg-canvas/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">
        <Link
          to={cancelHref}
          className={buttonClasses({ variant: "secondary", size: "lg", className: busy ? "pointer-events-none opacity-55" : undefined })}
          aria-disabled={busy}
          tabIndex={busy ? -1 : undefined}
        >
          {t("form.cancel")}
        </Link>
        <Button type="submit" size="lg" loading={busy && phase !== "done"} disabled={phase === "done"}>
          {busy ? t("form.saving") : t("form.save")}
        </Button>
      </div>
    </form>
  );
}
