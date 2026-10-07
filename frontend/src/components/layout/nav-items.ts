import { History, LayoutDashboard, LibraryBig, Settings, Users, Folders, type LucideIcon } from "lucide-react";
import type { MessageKey } from "@/lib/i18n/config";

export type NavItem = { href: string; label: MessageKey; icon: LucideIcon };

export const mainNav: NavItem[] = [
  { href: "/songs", label: "nav.library", icon: LibraryBig },
  { href: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
  { href: "/categories", label: "nav.categories", icon: Folders },
];

export const adminNav: NavItem[] = [
  { href: "/users", label: "nav.users", icon: Users },
  { href: "/activity", label: "nav.activity", icon: History },
];

export const settingsNav: NavItem = { href: "/settings", label: "nav.settings", icon: Settings };
