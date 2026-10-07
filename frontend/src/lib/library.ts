// Song Library URL state, shared by server pages and client controls.

export const SORT_OPTIONS = [
  "relevance",
  "location",
  "number_asc",
  "number_desc",
  "title_asc",
  "title_desc",
  "created_desc",
  "updated_desc",
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number];

export const PAGE_SIZE = 50;

export function isSortOption(value: unknown): value is SortOption {
  return typeof value === "string" && (SORT_OPTIONS as readonly string[]).includes(value);
}

export type LibraryParams = {
  q?: string | null;
  category?: number | null;
  binder?: number | null;
  /** Only set when the user chose a sort explicitly. */
  sort?: SortOption | null;
  page?: number | null;
};

function wholeNumber(value: string | undefined) {
  return value && /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
}

/**
 * Reads the library state from URL parameters (shared by the page and the CSV export).
 * Unknown categories and binders that do not exist are ignored.
 */
export function readLibraryParams<C extends { id: number; binderCount: number }>(
  get: (name: string) => string | undefined,
  categories: C[],
) {
  const query = (get("q") ?? "").trim().slice(0, 100);
  const category = categories.find((item) => item.id === wholeNumber(get("category"))) ?? null;
  const binderParam = wholeNumber(get("binder"));
  const binder = category && binderParam && binderParam <= category.binderCount ? binderParam : null;
  const sortParam = get("sort");
  const explicitSort: SortOption | null = isSortOption(sortParam) && !(sortParam === "relevance" && !query) ? sortParam : null;
  const sort: SortOption = explicitSort ?? (query ? "relevance" : "location");
  const page = Math.max(1, wholeNumber(get("page")) ?? 1);
  return { query, category, binder, explicitSort, sort, page };
}

export function libraryHref({ q, category, binder, sort, page }: LibraryParams) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) {
    params.set("category", String(category));
    if (binder) params.set("binder", String(binder));
  }
  if (sort && !(sort === "relevance" && !q)) params.set("sort", sort);
  if (page && page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/songs?${search}` : "/songs";
}
