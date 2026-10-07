import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { api, errorOf } from "@/api/client";
import { keys, useCurrentUser } from "@/api/queries";
import type { SessionData } from "@/api/types";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { adminNav, mainNav, settingsNav, type NavItem } from "./nav-items";

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Link
      to={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors",
        active ? "bg-brand-800 text-white shadow-sm" : "text-stone-700 hover:bg-stone-100 hover:text-stone-900",
      )}
    >
      {active ? <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-gold-400" aria-hidden /> : null}
      <Icon className="size-5 shrink-0" aria-hidden />
      {t(item.label)}
    </Link>
  );
}

/** Navigation shared by the desktop sidebar and the mobile drawer. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await api("/auth/logout", { method: "POST" });
      queryClient.removeQueries({ predicate: (item) => item.queryKey[0] !== "session" });
      queryClient.setQueryData<SessionData>(keys.session, (session) => (session ? { ...session, user: null } : session));
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(t(errorOf(error).message));
      setSigningOut(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <nav className="flex-1 space-y-1" aria-label="Main">
        {mainNav.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}

        {user.isAdmin ? (
          <>
            <p className="px-3 pt-5 pb-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">{t("nav.adminSection")}</p>
            {adminNav.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} />
            ))}
          </>
        ) : null}

        <div className="pt-5">
          <NavLink item={settingsNav} onNavigate={onNavigate} />
        </div>
      </nav>

      <div className="mt-6 border-t border-stone-200 pt-4">
        <p className="px-3 text-xs text-stone-500">{t("nav.signedInAs")}</p>
        <p className="truncate px-3 font-medium text-stone-900">{user.displayName}</p>
        <p className="truncate px-3 text-sm text-stone-600">{user.isAdmin ? t("users.role.admin") : t("users.role.member")}</p>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-3 flex h-11 w-full items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-stone-700 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-60"
        >
          {signingOut ? <Spinner className="size-5" /> : <LogOut className="size-5" aria-hidden />}
          {t("nav.signOut")}
        </button>
      </div>
    </div>
  );
}
