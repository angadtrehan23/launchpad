"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Mobile bottom sheet; centred dialog on wider screens.
 * Header and footer stay put; only the middle scrolls. "Done" is pinned at the bottom so it never moves.
 */
export default function Sheet({ open, onClose, title, children, footer, done = true }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; done?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-neutral-200 bg-white text-ink shadow-2xl sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-5 py-3.5">
          <h3 className="font-display text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-600" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {(footer || done) && (
          <div className="shrink-0 space-y-3 border-t border-neutral-100 bg-white px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
            {done && (
              <button onClick={onClose} className="w-full rounded-xl bg-ink py-3 text-sm font-semibold text-white">
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="text-sm font-semibold">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-base outline-none focus:border-violet focus:bg-white";
