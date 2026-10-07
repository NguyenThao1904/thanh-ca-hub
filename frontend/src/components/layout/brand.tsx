import { Link } from "react-router";
import { useAppConfig } from "@/api/queries";

export function BrandMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#263859" />
      <rect x="16" y="14" width="26" height="36" rx="3" fill="#f7f6f3" />
      <rect x="22" y="14" width="26" height="36" rx="3" fill="#ffffff" stroke="#c08529" strokeWidth="2" />
      <path d="M30 25h12M30 31h12M30 37h8" stroke="#263859" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ tagline, onNavigate }: { tagline: string; onNavigate?: () => void }) {
  const { appName } = useAppConfig();
  return (
    <Link to="/songs" onClick={onNavigate} className="flex items-center gap-3 rounded-lg">
      <BrandMark />
      <span className="min-w-0">
        <span className="block truncate text-[17px] leading-tight font-semibold text-stone-900">{appName}</span>
        <span className="block truncate text-xs text-stone-500">{tagline}</span>
      </span>
    </Link>
  );
}
