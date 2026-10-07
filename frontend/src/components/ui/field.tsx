import { CircleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-lg border border-stone-300 bg-white px-3 text-base text-stone-900 shadow-sm transition-colors " +
  "placeholder:text-stone-400 hover:border-stone-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 " +
  "disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500 aria-invalid:border-red-600 aria-invalid:ring-red-600/20";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "h-11 appearance-auto pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export type FieldControlProps = {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
};

type FieldProps = {
  id: string;
  label: ReactNode;
  required?: boolean;
  /** Shown after the label for optional fields, e.g. "(optional)". */
  optionalText?: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  /** Receives the id and ARIA attributes that tie the control to its label, hint and error. */
  children: (control: FieldControlProps) => ReactNode;
};

export function Field({ id, label, required, optionalText, hint, error, className, children }: FieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-stone-800">
        {label}
        {required ? (
          <span className="ml-0.5 text-red-700" aria-hidden>
            *
          </span>
        ) : optionalText ? (
          <span className="ml-1.5 font-normal text-stone-500">({optionalText})</span>
        ) : null}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-stone-600">
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm font-medium text-red-700">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** A form-level error box, e.g. for errors returned by the server. */
export function FormAlert({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
      <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-[15px] font-medium">{children}</div>
      {action}
    </div>
  );
}
