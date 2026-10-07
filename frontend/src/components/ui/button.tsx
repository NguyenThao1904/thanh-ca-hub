import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-brand-800 text-white shadow-sm hover:bg-brand-900 active:bg-brand-950",
  secondary: "border border-stone-300 bg-white text-stone-800 shadow-sm hover:bg-stone-50 active:bg-stone-100",
  danger: "bg-red-700 text-white shadow-sm hover:bg-red-800 active:bg-red-900",
  ghost: "text-stone-700 hover:bg-stone-100 active:bg-stone-200",
  subtle: "bg-brand-50 text-brand-800 hover:bg-brand-100 active:bg-brand-200",
};

const sizes: Record<Size, string> = {
  sm: "h-9 gap-1.5 rounded-lg px-3 text-sm",
  md: "h-11 gap-2 rounded-lg px-4 text-[15px]",
  lg: "h-12 gap-2 rounded-xl px-5 text-base",
  icon: "size-11 rounded-lg",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors",
    "disabled:pointer-events-none disabled:opacity-55 [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    className,
  );
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant, size, loading, icon, className, children, disabled, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "to"> & {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
};

export function ButtonLink({ href, variant, size, icon, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link to={href} className={buttonClasses({ variant, size, className })} {...props}>
      {icon}
      {children}
    </Link>
  );
}
