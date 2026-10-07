import { Copy, KeyRound, Pencil, Trash2, UserCheck, UserPlus, UserX } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, errorOf, type ActionError } from "@/api/client";
import { useRefreshData } from "@/api/queries";
import type { ManagedUser, Role } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select } from "@/components/ui/field";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type DialogState =
  | { kind: "add" }
  | { kind: "edit"; user: ManagedUser }
  | { kind: "password"; user: ManagedUser }
  | { kind: "deactivate"; user: ManagedUser }
  | { kind: "delete"; user: ManagedUser }
  | { kind: "share"; name: string; password: string }
  | null;

function generatePassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

export function UserManager({ users, currentUserId }: { users: ManagedUser[]; currentUserId: number }) {
  const { t, locale } = useI18n();
  const refreshData = useRefreshData();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<unknown>, successMessage: string) {
    setPending(true);
    try {
      await action();
      setDialog(null);
      toast.success(successMessage);
      void refreshData();
    } catch (error) {
      const { message, params } = errorOf(error);
      toast.error(t(message, params));
    } finally {
      setPending(false);
    }
  }

  const setActive = (user: ManagedUser, active: boolean) =>
    api(`/users/${user.id}/active`, { method: "POST", body: { active } });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setDialog({ kind: "add" })} icon={<UserPlus className="size-5" aria-hidden />}>
          {t("users.add")}
        </Button>
      </div>

      <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        {users.map((user) => {
          const isSelf = user.id === currentUserId;
          return (
            <li key={user.id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-[16px] font-semibold text-stone-900">{user.displayName}</span>
                  {isSelf ? <Badge tone="gold">{t("users.you")}</Badge> : null}
                  <Badge tone={user.role === "admin" ? "brand" : "neutral"}>{t(`users.role.${user.role}`)}</Badge>
                  <Badge tone={user.isActive ? "success" : "danger"}>{user.isActive ? t("users.active") : t("users.inactive")}</Badge>
                </p>
                <p className="mt-0.5 truncate text-[15px] text-stone-600">{user.email}</p>
                <p className="mt-0.5 text-sm text-stone-500">
                  {t("users.lastSignIn")}: {user.lastSignInAt ? formatDateTime(user.lastSignInAt, locale) : t("users.never")}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: "edit", user })} icon={<Pencil className="size-4" aria-hidden />}>
                  {t("users.edit")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDialog({ kind: "password", user })}
                  icon={<KeyRound className="size-4" aria-hidden />}
                >
                  {t("users.resetPassword")}
                </Button>
                {!isSelf ? (
                  user.isActive ? (
                    <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: "deactivate", user })} icon={<UserX className="size-4" aria-hidden />}>
                      {t("users.deactivate")}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={() => run(() => setActive(user, true), t("users.activated"))}
                      icon={<UserCheck className="size-4" aria-hidden />}
                    >
                      {t("users.activate")}
                    </Button>
                  )
                ) : null}
                {!isSelf ? (
                  <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "delete", user })} icon={<Trash2 className="size-4 text-red-700" aria-hidden />}>
                    {t("users.delete")}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
        {users.length === 0 ? <li className="p-6 text-center text-stone-600">{t("users.empty")}</li> : null}
      </ul>

      {dialog?.kind === "add" ? (
        <AddUserDialog
          onClose={() => setDialog(null)}
          onCreated={(name, password) => {
            setDialog({ kind: "share", name, password });
            void refreshData();
          }}
        />
      ) : null}

      {dialog?.kind === "edit" ? (
        <EditUserDialog
          user={dialog.user}
          isSelf={dialog.user.id === currentUserId}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void refreshData();
          }}
        />
      ) : null}

      {dialog?.kind === "password" ? (
        <ResetPasswordDialog
          user={dialog.user}
          onClose={() => setDialog(null)}
          onReset={(password) => setDialog({ kind: "share", name: dialog.user.displayName, password })}
        />
      ) : null}

      {dialog?.kind === "share" ? <SharePasswordDialog name={dialog.name} password={dialog.password} onClose={() => setDialog(null)} /> : null}

      <ConfirmDialog
        open={dialog?.kind === "deactivate"}
        onClose={() => setDialog(null)}
        title={t("users.deactivateTitle")}
        confirmLabel={t("users.deactivate")}
        pending={pending}
        onConfirm={() => dialog?.kind === "deactivate" && run(() => setActive(dialog.user, false), t("users.deactivated"))}
      >
        {dialog?.kind === "deactivate" ? <p>{t("users.deactivateMessage", { name: dialog.user.displayName })}</p> : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onClose={() => setDialog(null)}
        title={t("users.deleteTitle")}
        confirmLabel={t("users.delete")}
        pending={pending}
        onConfirm={() => dialog?.kind === "delete" && run(() => api(`/users/${dialog.user.id}`, { method: "DELETE" }), t("users.deleted"))}
      >
        {dialog?.kind === "delete" ? <p>{t("users.deleteMessage", { name: dialog.user.displayName, email: dialog.user.email })}</p> : null}
      </ConfirmDialog>
    </>
  );
}

/** Server errors for a dialog form: field messages next to inputs, others at the top. */
function useFormErrors() {
  const { t } = useI18n();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<ActionError | null>(null);

  function fromError(failure: unknown) {
    const error = errorOf(failure);
    setFormError(error.fieldErrors ? null : error);
    const translated: Record<string, string> = {};
    for (const [field, key] of Object.entries(error.fieldErrors ?? {})) translated[field] = t(key, error.params);
    setErrors(translated);
  }

  function reset() {
    setErrors({});
    setFormError(null);
  }

  return { errors, formError, fromError, reset };
}

function PasswordInput({
  control,
  value,
  onChange,
}: {
  control: { id: string; "aria-invalid"?: true; "aria-describedby"?: string };
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2">
      <Input {...control} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="new-password" spellCheck={false} className="font-mono" />
      <Button variant="secondary" onClick={() => onChange(generatePassword())}>
        {t("users.generate")}
      </Button>
    </div>
  );
}

function AddUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string, password: string) => void }) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [password, setPassword] = useState(() => generatePassword());
  const { errors, formError, fromError, reset } = useFormErrors();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    reset();
    setPending(true);
    try {
      const created = await api<ManagedUser>("/users", { method: "POST", body: { displayName, email, role, password } });
      toast.success(t("users.created"));
      onCreated(created.displayName, password);
    } catch (error) {
      fromError(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={t("users.addTitle")} dismissible={!pending}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError ? <FormAlert>{t(formError.message, formError.params)}</FormAlert> : null}
        <Field id="user-name" label={t("users.displayName")} required error={errors.displayName}>
          {(control) => <Input {...control} value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} data-autofocus />}
        </Field>
        <Field id="user-email" label={t("users.email")} required error={errors.email}>
          {(control) => (
            <Input
              {...control}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
        <Field id="user-role" label={t("users.role")} required>
          {(control) => (
            <Select {...control} value={role} onChange={(event) => setRole(event.target.value === "admin" ? "admin" : "member")}>
              <option value="member">{t("users.role.member")}</option>
              <option value="admin">{t("users.role.admin")}</option>
            </Select>
          )}
        </Field>
        <Field id="user-password" label={t("users.password")} required hint={t("users.passwordHelp")} error={errors.password}>
          {(control) => <PasswordInput control={control} value={password} onChange={setPassword} />}
        </Field>
        <DialogActions>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={pending}>
            {t("users.add")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function EditUserDialog({ user, isSelf, onClose, onSaved }: { user: ManagedUser; isSelf: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState<Role>(user.role);
  const { errors, formError, fromError, reset } = useFormErrors();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    reset();
    setPending(true);
    try {
      await api(`/users/${user.id}`, { method: "PATCH", body: { displayName, role } });
      toast.success(t("users.saved"));
      onSaved();
    } catch (error) {
      fromError(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={t("users.editTitle")} description={user.email} dismissible={!pending}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError ? <FormAlert>{t(formError.message, formError.params)}</FormAlert> : null}
        <Field id="edit-user-name" label={t("users.displayName")} required error={errors.displayName}>
          {(control) => <Input {...control} value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} data-autofocus />}
        </Field>
        <Field id="edit-user-role" label={t("users.role")} required hint={isSelf ? t("errors.notYourself") : undefined}>
          {(control) => (
            <Select
              {...control}
              value={role}
              disabled={isSelf}
              onChange={(event) => setRole(event.target.value === "admin" ? "admin" : "member")}
            >
              <option value="member">{t("users.role.member")}</option>
              <option value="admin">{t("users.role.admin")}</option>
            </Select>
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

function ResetPasswordDialog({ user, onClose, onReset }: { user: ManagedUser; onClose: () => void; onReset: (password: string) => void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState(() => generatePassword());
  const { errors, formError, fromError, reset } = useFormErrors();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    reset();
    setPending(true);
    try {
      await api(`/users/${user.id}/password`, { method: "POST", body: { password } });
      toast.success(t("users.passwordWasReset"));
      onReset(password);
    } catch (error) {
      fromError(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={t("users.resetTitle", { name: user.displayName })} description={user.email} dismissible={!pending}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError ? <FormAlert>{t(formError.message, formError.params)}</FormAlert> : null}
        <Field id="reset-password" label={t("users.newPassword")} required hint={t("users.passwordHelp")} error={errors.password}>
          {(control) => <PasswordInput control={control} value={password} onChange={setPassword} />}
        </Field>
        <DialogActions>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={pending}>
            {t("users.resetPassword")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function SharePasswordDialog({ name, password, onClose }: { name: string; password: string; onClose: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success(t("users.copied"));
    } catch {
      // Clipboard can be blocked; the password is still visible to copy by hand.
    }
  }

  return (
    <Dialog open onClose={onClose} title={t("users.password")}>
      <p className="text-[15px] text-stone-700">{t("users.passwordShare", { name })}</p>
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
        <code className="min-w-0 flex-1 font-mono text-lg font-semibold break-all text-stone-900 select-all">{password}</code>
        <Button variant="secondary" size="sm" onClick={copy} icon={<Copy className={cn("size-4", copied && "text-emerald-700")} aria-hidden />}>
          {copied ? t("users.copied") : t("users.copy")}
        </Button>
      </div>
      <DialogActions>
        <Button onClick={onClose} data-autofocus>
          {t("users.done")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
