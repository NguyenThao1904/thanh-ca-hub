import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "./button";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** When false, Esc and clicks outside do nothing (e.g. while saving). */
  dismissible?: boolean;
  size?: "sm" | "md" | "lg";
};

/**
 * Accessible modal built on the native <dialog> element (focus trap and Esc for free).
 * The element marked with data-autofocus receives focus when the dialog opens.
 */
export function Dialog({ open, onClose, title, description, children, dismissible = true, size = "md" }: DialogProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const pressStartedOnBackdrop = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      onMouseDown={(event) => {
        pressStartedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (dismissible && pressStartedOnBackdrop.current && event.target === event.currentTarget) onClose();
      }}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl bg-white text-stone-900 shadow-2xl",
        "opacity-100 transition-opacity duration-150 starting:opacity-0",
        size === "sm" && "max-w-sm",
        size === "md" && "max-w-md",
        size === "lg" && "max-w-xl",
      )}
    >
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-stone-900">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-[15px] text-stone-600">
                {description}
              </p>
            ) : null}
          </div>
          {dismissible ? (
            <button
              type="button"
              onClick={onClose}
              className="-m-2 rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
              aria-label={t("common.close")}
            >
              <X className="size-5" />
            </button>
          ) : null}
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>;
}

type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  tone?: "danger" | "primary";
};

/** Confirmation with "Cancel" focused by default, so Enter never confirms by accident. */
export function ConfirmDialog({ open, onClose, title, children, confirmLabel, onConfirm, pending, tone = "danger" }: ConfirmDialogProps) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onClose={onClose} title={title} dismissible={!pending}>
      <div className="space-y-2 text-[15px] leading-relaxed text-stone-700">{children}</div>
      <DialogActions>
        <Button variant="secondary" onClick={onClose} disabled={pending} data-autofocus>
          {t("common.cancel")}
        </Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={pending}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
