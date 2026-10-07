import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

const STORAGE_KEY = "library-url";

/** Remembers the last library search/filter, so "Back to library" returns to it. */
export function RememberLibraryUrl() {
  const [searchParams] = useSearchParams();
  useEffect(() => {
    try {
      const search = searchParams.toString();
      sessionStorage.setItem(STORAGE_KEY, search ? `/songs?${search}` : "/songs");
    } catch {
      // Storage can be unavailable (private mode); the link then simply opens /songs.
    }
  }, [searchParams]);
  return null;
}

export function BackToLibraryLink({ label }: { label: string }) {
  const navigate = useNavigate();
  return (
    <Link
      to="/songs"
      onClick={(event) => {
        let saved: string | null = null;
        try {
          saved = sessionStorage.getItem(STORAGE_KEY);
        } catch {
          // ignore
        }
        if (saved && saved.startsWith("/songs") && saved !== "/songs") {
          event.preventDefault();
          navigate(saved);
        }
      }}
      className="inline-flex h-10 items-center gap-1.5 rounded-lg pr-3 text-[15px] font-medium text-stone-600 hover:text-stone-900"
    >
      <ArrowLeft className="size-5" aria-hidden />
      {label}
    </Link>
  );
}
