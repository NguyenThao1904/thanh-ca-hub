import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Brand } from "./brand";
import { HeaderSearch } from "./header-search";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();

  return (
    <div className="min-h-dvh lg:pl-64">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        {t("app.skipToContent")}
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto border-r border-stone-200 bg-white px-4 py-5 lg:flex">
        <div className="mb-8 px-1">
          <Brand tagline={t("app.tagline")} />
        </div>
        <SidebarNav />
      </aside>

      <header className="sticky top-0 z-20 border-b border-stone-200 bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6 lg:px-8">
          <MobileNav />
          <div className="min-w-0 flex-1 lg:max-w-2xl">
            <HeaderSearch />
          </div>
          <p className="ml-auto hidden text-sm text-stone-500 xl:block">{t("search.shortcut")}</p>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pt-5 pb-16 sm:px-6 lg:px-8 lg:pt-8">
        {children}
      </main>
    </div>
  );
}
