import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Brand } from "./brand";
import { SidebarNav } from "./sidebar-nav";

/** Menu button and slide-in drawer for phones and tablets. */
export function MobileNav() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-1 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100 lg:hidden"
        aria-label={t("nav.menu")}
        aria-expanded={open}
      >
        <Menu className="size-6" />
      </button>

      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        aria-label={t("nav.menu")}
        className="m-0 h-dvh max-h-dvh w-[min(20rem,calc(100%-3rem))] max-w-none bg-white shadow-2xl transition-transform duration-200 starting:-translate-x-full"
      >
        <div className="flex h-full flex-col overflow-y-auto p-4">
          <div className="mb-6 flex items-center justify-between gap-2">
            <Brand tagline={t("app.tagline")} onNavigate={() => setOpen(false)} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex size-11 items-center justify-center rounded-lg text-stone-600 hover:bg-stone-100"
              aria-label={t("nav.closeMenu")}
            >
              <X className="size-6" />
            </button>
          </div>
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
      </dialog>
    </>
  );
}
