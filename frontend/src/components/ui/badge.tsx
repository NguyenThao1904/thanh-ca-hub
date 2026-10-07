import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "brand" | "gold" | "pdf" | "image" | "success" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-700 ring-stone-200",
  brand: "bg-brand-50 text-brand-800 ring-brand-200",
  gold: "bg-gold-50 text-gold-700 ring-gold-200",
  pdf: "bg-red-50 text-red-700 ring-red-200",
  image: "bg-sky-50 text-sky-800 ring-sky-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
