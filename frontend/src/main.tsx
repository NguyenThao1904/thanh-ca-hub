import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "./styles.css";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { Toaster } from "sonner";
import { ApiError, onSessionExpired } from "@/api/client";
import { keys, useSession } from "@/api/queries";
import type { SessionData } from "@/api/types";
import { BrandMark } from "@/components/layout/brand";
import { Spinner } from "@/components/ui/spinner";
import { setTimeZone } from "@/lib/format";
import { I18nProvider } from "@/lib/i18n/client";
import { router } from "./router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Do not retry what will fail again (signed out, no permission, deleted).
      retry: (failures, error) =>
        failures < 2 && !(error instanceof ApiError && [401, 403, 404, 422].includes(error.status)),
    },
  },
});

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy>
      <BrandMark className="size-12 animate-pulse" />
    </div>
  );
}

/** When the server could not be reached at start-up. Bilingual: the language is not known yet. */
function StartError({ retry, retrying }: { retry: () => void; retrying: boolean }) {
  return (
    <main className="mx-auto mt-[15vh] max-w-md px-4 text-center">
      <BrandMark className="mx-auto size-12" />
      <h1 className="mt-4 text-xl font-semibold text-stone-900">Không kết nối được máy chủ · Cannot reach the server</h1>
      <p className="mt-2 text-stone-600">Vui lòng kiểm tra kết nối và thử lại. · Please check your connection and try again.</p>
      <button
        type="button"
        onClick={retry}
        className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-brand-800 px-5 font-medium text-white hover:bg-brand-900"
      >
        {retrying ? <Spinner /> : null}
        Thử lại · Try again
      </button>
    </main>
  );
}

function App() {
  const client = useQueryClient();
  const session = useSession();

  useEffect(
    () =>
      onSessionExpired(() => {
        client.removeQueries({ predicate: (item) => item.queryKey[0] !== "session" });
        client.setQueryData<SessionData>(keys.session, (data) => (data?.user ? { ...data, user: null, expired: true } : data));
      }),
    [client],
  );

  if (session.isPending) return <Splash />;
  if (session.isError) return <StartError retry={() => session.refetch()} retrying={session.isFetching} />;

  setTimeZone(session.data.config.timeZone);
  return (
    <I18nProvider defaultLocale={session.data.config.defaultLocale}>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors closeButton />
    </I18nProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
