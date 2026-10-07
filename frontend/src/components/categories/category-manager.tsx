import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { api, errorOf, type ActionError } from "@/api/client";
import { useRefreshData } from "@/api/queries";
import type { Category } from "@/api/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { useI18n } from "@/lib/i18n/client";
import { libraryHref } from "@/lib/library";
import { parseWholeNumber } from "@/lib/utils";

type DialogState = { kind: "add" } | { kind: "edit"; category: Category } | { kind: "delete"; category: Category } | null;

export function CategoryManager({ categories, isAdmin }: { categories: Category[]; isAdmin: boolean }) {
  const { t } = useI18n();
  const refreshData = useRefreshData();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<unknown>, success?: string) {
    setPending(true);
    try {
      await action();
      await refreshData();
      if (success) toast.success(success);
      return true;
    } catch (error) {
      const { message, params } = errorOf(error);
      toast.error(t(message, params));
      return false;
    } finally {
      setPending(false);
    }
  }

  function move(category: Category, direction: -1 | 1) {
    void run(() => api(`/categories/${category.id}/move`, { method: "POST", body: { direction } }));
  }

  async function remove(category: Category) {
    if (await run(() => api(`/categories/${category.id}`, { method: "DELETE" }), t("categories.deleted"))) setDialog(null);
  }

  return (
    <>
      {isAdmin ? (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setDialog({ kind: "add" })} icon={<Plus className="size-5" aria-hidden />}>
            {t("categories.add")}
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left">
          <thead className="border-b border-stone-200 bg-stone-50 text-xs font-semibold tracking-wide text-stone-600 uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">
                {t("categories.name")}
              </th>
              <th scope="col" className="px-3 py-3">
                {t("categories.code")}
              </th>
              <th scope="col" className="px-3 py-3 text-right">
                {t("categories.binders")}
              </th>
              <th scope="col" className="hidden px-3 py-3 text-right sm:table-cell">
                {t("categories.songs")}
              </th>
              {isAdmin ? (
                <th scope="col" className="px-3 py-3 text-right">
                  <span className="sr-only">{t("categories.actions")}</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {categories.map((category, index) => (
              <tr key={category.id} className="hover:bg-stone-50/70">
                <td className="px-4 py-3">
                  <Link
                    to={libraryHref({ category: category.id })}
                    className="text-[16px] font-semibold text-stone-900 hover:text-brand-800 hover:underline"
                  >
                    {category.name}
                  </Link>
                  <p className="text-sm text-stone-500 sm:hidden">
                    {t("categories.songs")}: {category.songCount}
                  </p>
                </td>
                <td className="px-3 py-3">
                  <span className="rounded-md bg-brand-800 px-2 py-0.5 font-mono text-[15px] font-semibold text-white">{category.code}</span>
                </td>
                <td className="px-3 py-3 text-right text-[15px] text-stone-800 tabular">{category.binderCount}</td>
                <td className="hidden px-3 py-3 text-right text-[15px] text-stone-800 tabular sm:table-cell">{category.songCount}</td>
                {isAdmin ? (
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-end gap-0.5">
                      <IconAction label={t("categories.moveUp")} onClick={() => move(category, -1)} disabled={pending || index === 0}>
                        <ArrowUp className="size-4" />
                      </IconAction>
                      <IconAction
                        label={t("categories.moveDown")}
                        onClick={() => move(category, 1)}
                        disabled={pending || index === categories.length - 1}
                      >
                        <ArrowDown className="size-4" />
                      </IconAction>
                      <IconAction label={t("categories.edit")} onClick={() => setDialog({ kind: "edit", category })} disabled={pending}>
                        <Pencil className="size-4" />
                      </IconAction>
                      <IconAction
                        label={category.songCount > 0 ? t("categories.deleteDisabled") : t("categories.delete")}
                        onClick={() => setDialog({ kind: "delete", category })}
                        disabled={pending || category.songCount > 0}
                        danger
                      >
                        <Trash2 className="size-4" />
                      </IconAction>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {categories.length === 0 ? <p className="p-6 text-center text-stone-600">{t("categories.empty")}</p> : null}
      </div>

      {dialog?.kind === "add" || dialog?.kind === "edit" ? (
        <CategoryDialog
          key={dialog.kind === "edit" ? dialog.category.id : "new"}
          category={dialog.kind === "edit" ? dialog.category : null}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void refreshData();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onClose={() => setDialog(null)}
        title={t("categories.deleteTitle")}
        confirmLabel={t("categories.delete")}
        onConfirm={() => dialog?.kind === "delete" && remove(dialog.category)}
        pending={pending}
      >
        {dialog?.kind === "delete" ? <p>{t("categories.deleteMessage", { name: dialog.category.name, code: dialog.category.code })}</p> : null}
      </ConfirmDialog>
    </>
  );
}

function IconAction({
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
      className={`inline-flex size-10 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-30 ${
        danger ? "text-red-700 hover:bg-red-50 hover:text-red-800" : ""
      }`}
    >
      {children}
    </button>
  );
}

function CategoryDialog({ category, onClose, onSaved }: { category: Category | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(category?.name ?? "");
  const [code, setCode] = useState(category?.code ?? "");
  const [binderCount, setBinderCount] = useState(String(category?.binderCount ?? 1));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<ActionError | null>(null);
  const [pending, setPending] = useState(false);
  const minBinders = category?.maxBinderUsed ?? 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setPending(true);
    const body = { name, code, binderCount: parseWholeNumber(binderCount) ?? binderCount };
    try {
      if (category) await api(`/categories/${category.id}`, { method: "PUT", body });
      else await api("/categories", { method: "POST", body });
      toast.success(category ? t("categories.saved") : t("categories.created"));
      onSaved();
    } catch (error) {
      const result = errorOf(error);
      setFormError(result);
      const translated: Record<string, string> = {};
      for (const [field, key] of Object.entries(result.fieldErrors ?? {})) translated[field] = t(key, result.params);
      setErrors(translated);
    } finally {
      setPending(false);
    }
  }

  const codeChanged = category && code.trim().toLocaleUpperCase("vi") !== category.code && category.songCount > 0;

  return (
    <Dialog open onClose={onClose} title={category ? t("categories.editTitle") : t("categories.addTitle")} dismissible={!pending}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError && !formError.fieldErrors ? <FormAlert>{t(formError.message, formError.params)}</FormAlert> : null}
        <Field id="category-name" label={t("categories.nameLabel")} required error={errors.name}>
          {(control) => <Input {...control} value={name} onChange={(event) => setName(event.target.value)} maxLength={60} data-autofocus />}
        </Field>
        <Field
          id="category-code"
          label={t("categories.code")}
          required
          hint={codeChanged ? t("categories.codeChangeNote") : t("categories.codeHelp")}
          error={errors.code}
        >
          {(control) => (
            <Input
              {...control}
              value={code}
              onChange={(event) => setCode(event.target.value.toLocaleUpperCase("vi").replace(/\s/g, ""))}
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              className="font-mono uppercase"
            />
          )}
        </Field>
        <Field
          id="category-binders"
          label={t("categories.binderCountLabel")}
          required
          hint={minBinders > 1 ? t("categories.binderCountMin", { count: minBinders }) : t("categories.binderCountHelp")}
          error={errors.binderCount}
        >
          {(control) => (
            <Input
              {...control}
              value={binderCount}
              onChange={(event) => setBinderCount(event.target.value.replace(/[^\d]/g, "").slice(0, 2))}
              inputMode="numeric"
              className="w-28"
            />
          )}
        </Field>
        <DialogActions>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={pending}>
            {t("common.save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
