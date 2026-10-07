import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="mb-3 text-stone-400 [&_svg]:size-10">{icon}</div> : null}
      <p className="text-lg font-semibold text-stone-800">{title}</p>
      {description ? <p className="mt-1 max-w-md text-[15px] text-stone-600">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
