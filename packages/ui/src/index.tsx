import { clsx } from "clsx";
import { forwardRef, useEffect, useId, useRef } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function cn(...values: Array<string | false | null | undefined>): string {
  return clsx(values);
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function Button({ className, type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn("rounded-xl border border-zinc-800 bg-zinc-900/80 shadow-sm", className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const tones = {
    neutral: "border-zinc-700 bg-zinc-800 text-zinc-300",
    success: "border-emerald-800 bg-emerald-950 text-emerald-300",
    warning: "border-amber-800 bg-amber-950 text-amber-300",
    danger: "border-red-800 bg-red-950 text-red-300",
    info: "border-sky-800 bg-sky-950 text-sky-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  error,
  id: suppliedId,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | undefined }) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  return (
    <label className="grid gap-2 text-sm font-medium text-zinc-200" htmlFor={id}>
      {label}
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        {...props}
      />
      {error ? (
        <span id={`${id}-error`} className="text-xs text-red-300" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) closeButton.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        aria-describedby={description ? "modal-description" : undefined}
        aria-labelledby="modal-title"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="modal-title" className="text-lg font-semibold text-white">
              {title}
            </h2>
            {description ? (
              <p id="modal-description" className="mt-1 text-sm text-zinc-400">
                {description}
              </p>
            ) : null}
          </div>
          <button
            ref={closeButton}
            aria-label="닫기"
            className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
