import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, errorOf, type ActionError } from "@/api/client";
import { keys } from "@/api/queries";
import type { SessionData, SessionUser } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { useI18n } from "@/lib/i18n/client";

export function DisplayNameForm({ initialName }: { initialName: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const user = await api<SessionUser>("/me", { method: "PATCH", body: { displayName: name } });
      queryClient.setQueryData<SessionData>(keys.session, (session) => (session ? { ...session, user } : session));
      setName(user.displayName);
      toast.success(t("settings.nameSaved"));
    } catch (failure) {
      const result = errorOf(failure);
      setError(t(result.fieldErrors?.displayName ?? result.message, result.params));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field id="settings-name" label={t("settings.displayName")} error={error} className="flex-1">
        {(control) => <Input {...control} value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoComplete="name" />}
      </Field>
      <Button type="submit" loading={pending} className={error ? "sm:mb-7" : undefined}>
        {t("settings.saveName")}
      </Button>
    </form>
  );
}

export function PasswordForm({ email }: { email: string }) {
  const { t } = useI18n();
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<ActionError | null>(null);
  const [pending, setPending] = useState(false);

  function set(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      await api("/me/password", { method: "POST", body: values });
      setValues({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success(t("settings.passwordSaved"));
    } catch (failure) {
      const result = errorOf(failure);
      if (result.fieldErrors) {
        setErrors(Object.fromEntries(Object.entries(result.fieldErrors).map(([field, key]) => [field, t(key, result.params)])));
      } else {
        setFormError(result);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-md space-y-4">
      {/* Lets password managers attach the new password to the right account. */}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      {formError ? <FormAlert>{t(formError.message, formError.params)}</FormAlert> : null}
      <Field id="settings-current-password" label={t("settings.currentPassword")} error={errors.currentPassword}>
        {(control) => (
          <Input
            {...control}
            type="password"
            autoComplete="current-password"
            value={values.currentPassword}
            onChange={(event) => set("currentPassword", event.target.value)}
          />
        )}
      </Field>
      <Field id="settings-new-password" label={t("settings.newPassword")} hint={t("errors.passwordTooShort")} error={errors.newPassword}>
        {(control) => (
          <Input
            {...control}
            type="password"
            autoComplete="new-password"
            value={values.newPassword}
            onChange={(event) => set("newPassword", event.target.value)}
          />
        )}
      </Field>
      <Field id="settings-confirm-password" label={t("settings.confirmPassword")} error={errors.confirmPassword}>
        {(control) => (
          <Input
            {...control}
            type="password"
            autoComplete="new-password"
            value={values.confirmPassword}
            onChange={(event) => set("confirmPassword", event.target.value)}
          />
        )}
      </Field>
      <Button type="submit" loading={pending}>
        {t("settings.savePassword")}
      </Button>
    </form>
  );
}
