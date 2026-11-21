"use client";

import { useState } from "react";
import { formatInr } from "@/lib/pricing";
import { themeStyle } from "@/lib/themes";
import { BOOKABLE, FORMAT_LABEL, type Storefront } from "@/lib/types";

type Props = {
  store: Storefront;
  mode: "public" | "edit";
  busy?: string | null; // which target is regenerating: "profile" | "product:N" | "all"
  clicks?: number[];
  joins?: number[];
  onEditProfile?: () => void;
  onEditProduct?: (i: number) => void;
  onRegen?: (target: string) => void;
  onCta?: (i: number) => void;
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "✦"
  );
}

function SectionTools({ onEdit, onRegen, busy }: { onEdit?: () => void; onRegen?: () => void; busy: boolean }) {
  return (
    <div className="absolute right-3 top-3 z-10 flex gap-1.5">
      <button type="button" onClick={onEdit} disabled={busy} className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow ring-1 ring-black/10 active:scale-95 disabled:opacity-50">
        ✎ Edit
      </button>
      <button type="button" onClick={onRegen} disabled={busy} aria-label="Regenerate this section" className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow ring-1 ring-black/10 active:scale-95 disabled:opacity-50">
        {busy ? "…" : "↻ New"}
      </button>
    </div>
  );
}

function Shimmer() {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-white/60 backdrop-blur-[2px]">
      <span className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white">Updating…</span>
    </div>
  );
}

export default function StoreView({ store, mode, busy, clicks, joins, onEditProfile, onEditProduct, onRegen, onCta }: Props) {
  const edit = mode === "edit";
  const [openWhy, setOpenWhy] = useState<number | null>(null);
  const { creator, products } = store;
  const allBusy = busy === "all";

  return (
    <div style={themeStyle(store.theme)} className="min-h-full bg-[var(--sf-bg)] text-[var(--sf-ink)]">
      <div className="mx-auto w-full max-w-md pb-8">
        {/* Profile */}
        <section className="relative">
          {edit && <SectionTools busy={!!busy} onEdit={onEditProfile} onRegen={() => onRegen?.("profile")} />}
          {(busy === "profile" || allBusy) && <Shimmer />}
          <div className="relative h-32 w-full overflow-hidden" style={{ background: "var(--sf-hero)" }}>
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20" />
            <div className="absolute -bottom-16 left-6 h-32 w-32 rounded-full bg-white/10" />
          </div>
          <div className="relative z-10 -mt-12 px-5 text-center">
            <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full font-display text-3xl font-bold text-white" style={{ background: "var(--sf-hero)", border: "4px solid var(--sf-bg)", boxShadow: "var(--sf-shadow)" }}>
              {creator.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={creator.avatar} alt={creator.displayName} className="h-full w-full rounded-full object-cover" />
              ) : (
                initials(creator.displayName)
              )}
            </div>
            <h1 onClick={edit ? onEditProfile : undefined} className={`mt-3 font-display text-[28px] font-bold leading-tight ${edit ? "cursor-text" : ""}`}>
              {creator.displayName || "Your name"}
            </h1>
            {creator.handle &&
              (edit ? (
                <p className="mt-0.5 text-sm text-[var(--sf-muted)]">@{creator.handle}</p>
              ) : (
                <a href={`https://instagram.com/${creator.handle}`} target="_blank" rel="noopener noreferrer nofollow" className="mt-0.5 inline-block text-sm text-[var(--sf-muted)] underline-offset-2 hover:underline">
                  @{creator.handle} ↗
                </a>
              ))}
            {creator.tagline && (
              <p onClick={edit ? onEditProfile : undefined} className={`mt-3 text-base font-semibold leading-snug ${edit ? "cursor-text" : ""}`}>
                {creator.tagline}
              </p>
            )}
            {creator.bio && (
              <p onClick={edit ? onEditProfile : undefined} className={`mt-2 text-[15px] leading-relaxed text-[var(--sf-muted)] ${edit ? "cursor-text" : ""}`}>
                {creator.bio}
              </p>
            )}
          </div>
        </section>

        {/* Products */}
        <section className="mt-7 space-y-4 px-4">
          {products.map((p, i) => {
            const target = `product:${i}`;
            const bookable = BOOKABLE.includes(p.format);
            return (
              <article key={i} className="relative overflow-hidden rounded-3xl bg-[var(--sf-card)] p-5" style={{ border: "var(--sf-border) solid var(--sf-line)", boxShadow: "var(--sf-shadow)" }}>
                {edit && <SectionTools busy={!!busy} onEdit={() => onEditProduct?.(i)} onRegen={() => onRegen?.(target)} />}
                {(busy === target || allBusy) && <Shimmer />}
                <div className="flex flex-wrap items-center gap-1.5 pr-32">
                  <span className="inline-block rounded-full bg-[var(--sf-chip)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide" style={{ border: "var(--sf-border) solid var(--sf-line)" }}>{FORMAT_LABEL[p.format]}</span>
                </div>
                <h2 onClick={edit ? () => onEditProduct?.(i) : undefined} className={`mt-3 font-display text-xl font-bold leading-snug ${edit ? "cursor-text" : ""}`}>
                  {p.title || "Untitled product"}
                </h2>
                <p onClick={edit ? () => onEditProduct?.(i) : undefined} className={`mt-2 text-[15px] leading-relaxed text-[var(--sf-muted)] ${edit ? "cursor-text" : ""}`}>
                  {p.description}
                </p>
                {p.highlights.filter(Boolean).length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {p.highlights.filter(Boolean).map((h, j) => (
                      <li key={j} className="flex gap-2 text-sm">
                        <span className="font-bold text-[var(--sf-accent)]">✓</span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sf-muted)]">{bookable ? "Limited slots" : "Early access price"}</div>
                    <div className="font-display text-[28px] font-bold leading-none">{p.priceInr > 0 ? formatInr(p.priceInr) : "Free"}</div>
                    {edit && p.priceRationale && (
                      <button type="button" className="mt-0.5 text-xs font-semibold text-[var(--sf-accent)] underline underline-offset-2" onClick={() => setOpenWhy(openWhy === i ? null : i)}>
                        Why {p.priceInr > 0 ? formatInr(p.priceInr) : "free"}?
                      </button>
                    )}
                  </div>
                  <button type="button" onClick={() => onCta?.(i)} className="press rounded-2xl bg-[var(--sf-accent)] px-5 py-3 text-sm font-bold text-[var(--sf-accent-ink)]" style={{ border: "var(--sf-border) solid var(--sf-line)", boxShadow: "var(--sf-shadow)" }}>
                    {p.ctaLabel || (bookable ? "Request a slot" : "Join the waitlist")}
                  </button>
                </div>
                {edit && openWhy === i && (
                  <p className="mt-3 rounded-xl bg-[var(--sf-chip)] p-3 text-xs leading-relaxed">
                    <b>Only you see this.</b> {p.priceRationale}
                  </p>
                )}
                {edit && (clicks?.[i] !== undefined || joins?.[i] !== undefined) && (
                  <p className="mt-3 text-xs text-[var(--sf-muted)]">
                    🙋 <b>{joins?.[i] ?? 0}</b> on the waitlist · 👆 {clicks?.[i] ?? 0} taps
                  </p>
                )}
              </article>
            );
          })}
        </section>

        <footer className="mt-10 px-6 text-center text-[11px] leading-relaxed text-[var(--sf-muted)]">
          {mode === "public" && <p>Unverified creator page. Payments open once the creator turns on checkout.</p>}
          <p className="mt-1">
            Built in 2 minutes with <b>Launchpad</b> · a concept for SuperProfile
          </p>
        </footer>
      </div>
    </div>
  );
}
