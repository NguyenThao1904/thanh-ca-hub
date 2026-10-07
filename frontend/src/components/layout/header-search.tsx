import { useIsFetching } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { Spinner } from "@/components/ui/spinner";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const LIBRARY_PATH = "/songs";

/**
 * The global song search. On the library page results update as you type
 * (the query lives in the URL, so Back and shared links work); elsewhere,
 * pressing Enter opens the library with the results.
 */
export function HeaderSearch({ size = "md", autoFocus = false }: { size?: "md" | "lg"; autoFocus?: boolean }) {
  const { t } = useI18n();
  const navigateTo = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const onLibrary = pathname === LIBRARY_PATH;
  const urlQuery = onLibrary ? (searchParams.get("q") ?? "") : null;
  const loading = useIsFetching({ queryKey: ["songs"] }) > 0 && onLibrary;

  const [value, setValue] = useState(urlQuery ?? "");
  const [lastSent, setLastSent] = useState(urlQuery ?? "");

  // When the URL changes from elsewhere (Back button, the "Song Library" link),
  // show its query, but never overwrite what the user is typing right now.
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== null && urlQuery !== lastSent) {
      setLastSent(urlQuery);
      setValue(urlQuery);
    }
  }

  function navigate(query: string, mode: "push" | "replace") {
    const params = new URLSearchParams(onLibrary ? searchParams.toString() : "");
    if (query) params.set("q", query);
    else params.delete("q");
    params.delete("page");
    if (!query && params.get("sort") === "relevance") params.delete("sort");

    setLastSent(query);
    const href = params.size > 0 ? `${LIBRARY_PATH}?${params.toString()}` : LIBRARY_PATH;
    navigateTo(href, mode === "replace" ? { replace: true, preventScrollReset: true } : undefined);
  }

  const searchAsYouType = useEffectEvent((query: string) => navigate(query, "replace"));

  useEffect(() => {
    if (!onLibrary) return;
    const query = value.trim();
    if (query === (urlQuery ?? "").trim()) return;
    const timer = window.setTimeout(() => searchAsYouType(query), 250);
    return () => window.clearTimeout(timer);
  }, [value, onLibrary, urlQuery]);

  // "/" focuses the search box from anywhere (unless the user is typing in a field).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], dialog[open]")) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const large = size === "lg";

  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(value.trim(), onLibrary ? "replace" : "push");
        // Hide the phone keyboard so the results are visible.
        if (window.matchMedia("(pointer: coarse)").matches) inputRef.current?.blur();
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        {t("search.label")}
      </label>
      <span
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-stone-500",
          large ? "left-4 [&_svg]:size-6" : "left-3 [&_svg]:size-5",
        )}
      >
        {loading ? <Spinner className={large ? "size-6" : "size-5"} /> : <Search aria-hidden />}
      </span>
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t("search.placeholder")}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        maxLength={100}
        autoFocus={autoFocus}
        className={cn(
          "w-full rounded-xl border border-stone-300 bg-white text-stone-900 shadow-sm placeholder:text-stone-500",
          "focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15",
          large ? "h-14 pr-12 pl-13 text-lg" : "h-11 pr-11 pl-10 text-base",
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            if (onLibrary) navigate("", "replace");
            inputRef.current?.focus();
          }}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 rounded-md p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800",
            large ? "right-3" : "right-2",
          )}
          aria-label={t("search.clear")}
        >
          <X className="size-5" />
        </button>
      ) : null}
    </form>
  );
}
