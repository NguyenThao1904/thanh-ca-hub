import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api, query } from "./client";
import type {
  AuditEntry,
  AuditPage,
  Category,
  LibraryStats,
  ManagedUser,
  SessionData,
  SongDetail,
  SongPage,
  SongSearch,
} from "./types";

export const keys = {
  session: ["session"] as const,
  categories: ["categories"] as const,
  songs: (search: SongSearch) => ["songs", search] as const,
  song: (id: number) => ["song", id] as const,
  history: (id: number) => ["song", id, "history"] as const,
  stats: ["stats"] as const,
  users: ["users"] as const,
  activity: (page: number) => ["activity", page] as const,
};

export function useSession() {
  return useQuery({ queryKey: keys.session, queryFn: () => api<SessionData>("/session"), staleTime: Infinity });
}

/** The signed-in person. Only use inside the app shell, which guarantees someone is signed in. */
export function useCurrentUser() {
  const { data } = useSession();
  if (!data?.user) throw new Error("useCurrentUser needs a signed-in user");
  return data.user;
}

export function useAppConfig() {
  const { data } = useSession();
  return data?.config ?? { appName: "Thánh Ca Hub", defaultLocale: "vi" as const, timeZone: "Asia/Ho_Chi_Minh" };
}

export function useCategories() {
  return useQuery({ queryKey: keys.categories, queryFn: () => api<Category[]>("/categories") });
}

export function useSongs(search: SongSearch, { enabled = true } = {}) {
  return useQuery({
    queryKey: keys.songs(search),
    queryFn: ({ signal }) =>
      api<SongPage>(
        `/songs${query({
          q: search.q,
          category: search.category,
          binder: search.binder,
          sort: search.sort,
          page: search.page && search.page > 1 ? search.page : null,
          pageSize: search.pageSize,
        })}`,
        { signal },
      ),
    // Keep showing the previous results while the next ones load (typing in the search box).
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useSong(id: number | null) {
  return useQuery({
    queryKey: keys.song(id ?? 0),
    queryFn: () => api<SongDetail>(`/songs/${id}`),
    enabled: id != null,
  });
}

export function useSongHistory(id: number, enabled: boolean) {
  return useQuery({ queryKey: keys.history(id), queryFn: () => api<AuditEntry[]>(`/songs/${id}/history`), enabled });
}

export function useStats() {
  return useQuery({ queryKey: keys.stats, queryFn: () => api<LibraryStats>("/stats") });
}

export function useUsers() {
  return useQuery({ queryKey: keys.users, queryFn: () => api<ManagedUser[]>("/users") });
}

export function useActivity(page: number) {
  return useQuery({
    queryKey: keys.activity(page),
    queryFn: () => api<AuditPage>(`/activity${query({ page: page > 1 ? page : null })}`),
    placeholderData: keepPreviousData,
  });
}

/** After any change: everything except the session is reloaded when next shown. */
export function refreshData(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ predicate: (item) => item.queryKey[0] !== "session" });
}

export function useRefreshData() {
  const queryClient = useQueryClient();
  return useCallback(() => refreshData(queryClient), [queryClient]);
}
