import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { api, errorOf } from "@/api/client";
import { keys, useAppConfig, useSession } from "@/api/queries";
import type { SessionData, SessionUser } from "@/api/types";
import { BrandMark } from "@/components/layout/brand";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/config";
import { useTitle } from "@/lib/title";
import { safeRedirectPath } from "@/lib/utils";

export function LoginPage() {
  const { t } = useI18n();
  const { appName } = useAppConfig();
  const { data: session } = useSession();
  const [searchParams] = useSearchParams();
  const next = safeRedirectPath(searchParams.get("next"));
  useTitle(t("login.title"));

  // Already signed in (e.g. the back button after signing in).
  if (session?.user) return <Navigate to={next} replace />;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark className="size-14" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-stone-900">{appName}</h1>
          <p className="mt-1 text-stone-600">{t("app.tagline")}</p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-5 text-lg font-semibold text-stone-900">{t("login.title")}</h2>
          <LoginForm next={next} initialError={searchParams.has("expired") ? "errors.sessionExpired" : null} />
          <p className="mt-5 text-sm text-stone-600">{t("login.forgot")}</p>
        </div>

        <div className="mt-6 flex justify-center">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}

function LoginForm({ next, initialError }: { next: string; initialError: MessageKey | null }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<MessageKey | null>(initialError);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const user = await api<SessionUser>("/auth/login", { method: "POST", body: { email, password } });
      // Data of a previous account must never show up for this one.
      queryClient.removeQueries({ predicate: (item) => item.queryKey[0] !== "session" });
      queryClient.setQueryData<SessionData>(keys.session, (session) => (session ? { ...session, user, expired: false } : session));
      navigate(next, { replace: true });
    } catch (failure) {
      setError(errorOf(failure).message);
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {error ? <FormAlert>{t(error)}</FormAlert> : null}

      <Field id="email" label={t("login.email")}>
        {(control) => (
          <Input
            {...control}
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
          />
        )}
      </Field>

      <Field id="password" label={t("login.password")}>
        {(control) => (
          <Input
            {...control}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        )}
      </Field>

      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {pending ? t("login.submitting") : t("login.submit")}
      </Button>
    </form>
  );
}
