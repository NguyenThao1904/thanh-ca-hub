import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  ScrollRestoration,
  useLocation,
  useNavigation,
  useRouteError,
} from "react-router";
import { useCurrentUser, useSession } from "@/api/queries";
import { AppShell } from "@/components/layout/app-shell";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NotFound } from "@/components/ui/query-state";
import { useI18n } from "@/lib/i18n/client";
import { useTitle } from "@/lib/title";
import { DashboardPage } from "@/pages/DashboardPage";
import { LibraryPage } from "@/pages/LibraryPage";
import { LoginPage } from "@/pages/LoginPage";

/** Pages for signed-in members; everyone else goes to the sign-in page first. */
function SignedIn() {
  const { data } = useSession();
  const location = useLocation();
  if (!data?.user) {
    const params = new URLSearchParams();
    const here = `${location.pathname}${location.search}`;
    if (here !== "/" && here !== "/songs") params.set("next", here);
    if (data?.expired) params.set("expired", "1");
    const search = params.toString();
    return <Navigate to={search ? `/login?${search}` : "/login"} replace />;
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

/** Members get a "page not found", as if admin pages did not exist. */
function AdminOnly({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  return user.isAdmin ? children : <NotFoundPage />;
}

function NotFoundPage() {
  const { t } = useI18n();
  useTitle(t("notFound.title"));
  return <NotFound />;
}

function RouteError() {
  const { t } = useI18n();
  const error = useRouteError();
  useEffect(() => {
    // Details stay in the console; people only see a friendly message.
    console.error(error);
  }, [error]);
  return (
    <EmptyState
      icon={<TriangleAlert />}
      title={t("errorPage.title")}
      description={t("errorPage.text")}
      action={
        <>
          {/* A full reload also picks up a new version of the app after an update. */}
          <Button onClick={() => window.location.reload()} icon={<RotateCcw className="size-5" aria-hidden />}>
            {t("common.retry")}
          </Button>
          <ButtonLink href="/songs" variant="secondary" reloadDocument>
            {t("common.goToLibrary")}
          </ButtonLink>
        </>
      }
    />
  );
}

/** A thin bar at the top while a page's code is being loaded. */
function NavigationProgress() {
  const navigation = useNavigation();
  if (navigation.state === "idle") return null;
  return <div className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-gold-500" role="progressbar" aria-busy />;
}

function Root() {
  return (
    <>
      <NavigationProgress />
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

const lazyPage = <T,>(load: () => Promise<T>, pick: (module: T) => () => ReactNode) => async () => ({
  Component: pick(await load()),
});

export const router = createBrowserRouter([
  {
    element: <Root />,
    hydrateFallbackElement: <div className="min-h-dvh" aria-busy />,
    children: [
      { path: "/login", element: <LoginPage /> },
      {
        element: <SignedIn />,
        children: [
          {
            errorElement: <RouteError />,
            children: [
              { index: true, element: <Navigate to="/songs" replace /> },
              { path: "songs", element: <LibraryPage /> },
              { path: "dashboard", element: <DashboardPage /> },
              {
                path: "songs/:id",
                lazy: lazyPage(() => import("@/pages/SongPage"), (module) => module.SongPage),
              },
              {
                path: "songs/new",
                lazy: lazyPage(
                  () => import("@/pages/SongFormPages"),
                  (module) =>
                    function NewSong() {
                      return (
                        <AdminOnly>
                          <module.NewSongPage />
                        </AdminOnly>
                      );
                    },
                ),
              },
              {
                path: "songs/:id/edit",
                lazy: lazyPage(
                  () => import("@/pages/SongFormPages"),
                  (module) =>
                    function EditSong() {
                      return (
                        <AdminOnly>
                          <module.EditSongPage />
                        </AdminOnly>
                      );
                    },
                ),
              },
              {
                path: "categories",
                lazy: lazyPage(() => import("@/pages/AdminPages"), (module) => module.CategoriesPage),
              },
              {
                path: "settings",
                lazy: lazyPage(() => import("@/pages/AdminPages"), (module) => module.SettingsPage),
              },
              {
                path: "users",
                lazy: lazyPage(
                  () => import("@/pages/AdminPages"),
                  (module) =>
                    function Users() {
                      return (
                        <AdminOnly>
                          <module.UsersPage />
                        </AdminOnly>
                      );
                    },
                ),
              },
              {
                path: "activity",
                lazy: lazyPage(
                  () => import("@/pages/AdminPages"),
                  (module) =>
                    function Activity() {
                      return (
                        <AdminOnly>
                          <module.ActivityPage />
                        </AdminOnly>
                      );
                    },
                ),
              },
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
