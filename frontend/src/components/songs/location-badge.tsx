import { formatLocation } from "@/lib/location";
import { cn } from "@/lib/utils";

const sizes = {
  sm: "rounded px-1.5 py-0.5 text-[13px]",
  md: "rounded-md px-2.5 py-1 text-[15px]",
  lg: "rounded-lg px-3 py-1.5 text-lg",
  xl: "rounded-xl px-4 py-2 text-3xl sm:text-4xl",
};

/** The physical location (e.g. NL-1.01): the most prominent element wherever a song appears. */
export function LocationBadge({
  code,
  binder,
  page,
  size = "md",
  className,
}: {
  code: string;
  binder: number;
  page: number;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center bg-brand-800 font-mono font-semibold tracking-tight whitespace-nowrap text-white tabular shadow-sm",
        sizes[size],
        className,
      )}
    >
      {formatLocation(code, binder, page)}
    </span>
  );
}
