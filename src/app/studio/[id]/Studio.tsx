"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import StoreView from "@/components/StoreView";
import Sheet, { Field, inputCls } from "@/components/Sheet";
import { dismissFlash, readFlash, rememberStore, tokenFor } from "@/lib/local";
import { bandFor, formatInr } from "@/lib/pricing";
import { THEME_META } from "@/lib/themes";
import {
  FORMAT_LABEL,
  FORMATS,
  SP_FEATURE_LABEL,
  THEMES,
  type Language,
  type Product,
  type StoreRecord,
  type StoreStats,
  type Storefront,
  type WaitlistEntry,
} from "@/lib/types";

type Rec = Omit<StoreRecord, "editToken">;
type Editing = { kind: "profile" } | { kind: "product"; i: number } | null;

const REGEN_HINTS = ["Different product ideas", "Lower prices", "More premium", "Shorter, punchier copy", "More personal tone"];

/** The real upgrade path on SuperProfile (from its public pricing page). Shown, not wired up. */
const UNLOCKS = [
  { icon: "💳", title: "Turn on payments", body: "UPI, cards and netbanking with T+1 payouts. Creator plan: ₹99 for the first month." },
  { icon: "🤖", title: "Auto-DM your store link", body: "Anyone who comments your keyword on a reel gets the link in their DMs." },
  { icon: "📣", title: "Message your waitlist", body: "Email everyone who joined the moment your product goes live." },
  { icon: "✈️", title: "Paid Telegram community", body: "Members are added after paying and removed when they stop." },
];

export default function Studio({ id }: { id: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [rec, setRec] = useState<Rec | null>(null);
  const [draft, setDraft] = useState<Storefront | null>(null);
  const [stats, setStats] = useState<StoreStats>({ views: 0, clicks: [], waitlist: [] });
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [doneSteps, setDoneSteps] = useState<number[]>([]);
  const pendingFields = useRef<Set<string>>(new Set());
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [aiHint, setAiHint] = useState("");
  const [regenOpen, setRegenOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [save, setSave] = useState<"saved" | "saving" | "error">("saved");
  const [toast, setToast] = useState("");
  const [banners, setBanners] = useState<{ assumption?: string; notice?: string }>({});
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  // ---- load ----
  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("k");
    const t = fromHash || tokenFor(id);
    if (!t) {
      // Token lives in the URL hash / localStorage, which only exist after mount.
       
      setLoadError("forbidden");
      return;
    }
    setToken(t);
    const flash = readFlash(id);
    if (flash) setBanners(flash);
    try {
      setDoneSteps(JSON.parse(localStorage.getItem(`sf:plan:${id}`) || "[]"));
    } catch {}
    fetch(`/api/stores/${id}`, { headers: { "x-edit-token": t } })
      .then(async (r) => {
        if (r.status === 404) throw new Error("missing");
        if (r.status === 403) throw new Error("forbidden");
        if (!r.ok) throw new Error("error");
        return r.json();
      })
      .then((data: { record: Rec; stats: StoreStats; waitlist: WaitlistEntry[] }) => {
        setRec(data.record);
        setDraft({ ...data.record.draft, plan: data.record.draft.plan || [] });
        setStats(data.stats);
        setWaitlist(data.waitlist || []);
        if (fromHash) {
          const c = data.record.draft.creator;
          rememberStore({ id, token: t, name: c.handle ? `@${c.handle}` : c.displayName, at: Date.now() });
        }
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [id]);

  // ---- autosave ----
  const persist = useCallback(
    (next: Storefront) => {
      if (!token) return;
      setSave("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const fields = [...pendingFields.current];
        pendingFields.current.clear();
        try {
          const r = await fetch(`/api/stores/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "x-edit-token": token },
            body: JSON.stringify({ draft: next, fields }),
          });
          setSave(r.ok ? "saved" : "error");
        } catch {
          setSave("error");
        }
      }, 700);
    },
    [id, token],
  );

  /** `field` names what the creator changed, for the edit-depth metric (which AI fields people fix). */
  const update = (fn: (d: Storefront) => Storefront, field?: string) => {
    if (field) pendingFields.current.add(field);
    setDraft((d) => {
      if (!d) return d;
      const next = fn(structuredClone(d));
      persist(next);
      return next;
    });
  };

  // ---- AI regenerate (whole page or one part) ----
  async function regen(target: string, hint = "", language?: Language) {
    if (!draft || !token || busy) return;
    setBusy(target);
    setEditing(null);
    setRegenOpen(false);
    setAiHint("");
    const body = { target, hint, draft: language ? { ...draft, language } : draft };
    try {
      const call = async () => {
        const r = await fetch(`/api/stores/${id}/regenerate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-edit-token": token },
          body: JSON.stringify(body),
        });
        return { r, data: await r.json().catch(() => ({})) };
      };
      let { r, data } = await call();
      // Free AI tier cooling down: tell the creator and retry once by itself, keeping the shimmer on.
      if (r.status === 503 && data.retryAfter > 0 && data.retryAfter <= 50) {
        showToast(data.error);
        await new Promise((res) => setTimeout(res, (data.retryAfter + 1) * 1000));
        ({ r, data } = await call());
      }
      if (!r.ok) throw new Error(data.error || "The AI couldn't respond just now. Your store is unchanged.");
      setDraft(data.draft);
      setSave("saved");
      if (target === "all") {
        setBanners({});
        dismissFlash(id);
      }
      showToast(target === "all" ? "Fresh version ready ✨" : "Updated ✨");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Something went wrong. Your store is unchanged.");
    } finally {
      setBusy(null);
    }
  }

  // ---- waitlist: remove a sign-up (followers can ask to be deleted) ----
  async function removeSignup(wl: WaitlistEntry) {
    if (!token || !confirm(`Remove ${wl.name} from the waitlist? Their number is deleted.`)) return;
    const r = await fetch(`/api/stores/${id}/waitlist`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-edit-token": token },
      body: JSON.stringify({ index: wl.index, phone: wl.phone }),
    }).catch(() => null);
    if (!r?.ok) return showToast("Couldn't remove that. Try again.");
    setWaitlist((list) => list.filter((x) => !(x.index === wl.index && x.phone === wl.phone)));
    setStats((s) => ({ ...s, waitlist: s.waitlist.map((n, i) => (i === wl.index ? Math.max(0, n - 1) : n)) }));
    showToast("Removed");
  }

  // ---- publish ----
  async function publish() {
    if (!draft || !token) return;
    setPublishing(true);
    try {
      const r = await fetch(`/api/stores/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-edit-token": token },
        body: JSON.stringify({ draft }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Couldn't publish. Please try again.");
      setRec((x) => (x ? { ...x, published: structuredClone(draft), publishedAt: data.publishedAt, slug: data.slug } : x));
      setSave("saved");
      setShareOpen(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't publish. Please try again.");
    } finally {
      setPublishing(false);
    }
  }

  // ---- states ----
  if (loadError) {
    const msg =
      loadError === "missing"
        ? "We couldn't find this store. It may have been created on a different link."
        : loadError === "forbidden"
          ? "Open this store from the device you created it on, or use your private edit link."
          : "We couldn't load your store. Check your connection and refresh.";
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <p className="text-4xl">🧭</p>
          <p className="mt-4 text-base">{msg}</p>
          <Link href="/" className="mt-6 inline-block rounded-xl bg-ink px-5 py-3 text-sm font-bold text-lime">
            Build a new store
          </Link>
        </div>
      </main>
    );
  }
  if (!rec || !draft) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-700" />
      </main>
    );
  }

  const published = !!rec.published;
  const dirty = published && JSON.stringify(rec.published) !== JSON.stringify(draft);
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/s/${rec.slug}` : `/s/${rec.slug}`;
  const editUrl = typeof window !== "undefined" ? `${window.location.origin}/studio/${id}#k=${token}` : "";
  const editingProduct = editing?.kind === "product" ? draft.products[editing.i] : null;

  const setProduct = (i: number, patch: Partial<Product>) =>
    update((d) => {
      d.products[i] = { ...d.products[i], ...patch };
      return d;
    }, Object.keys(patch)[0]);

  const toggleStep = (i: number) => {
    const next = doneSteps.includes(i) ? doneSteps.filter((x) => x !== i) : [...doneSteps, i];
    setDoneSteps(next);
    try {
      localStorage.setItem(`sf:plan:${id}`, JSON.stringify(next));
    } catch {}
  };
  const totalWaitlist = waitlist.length;

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      showToast("Couldn't copy — press and hold the link to copy it.");
    }
  }

  return (
    <main className="min-h-dvh bg-paper dotted">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-2.5">
          <Link href="/" className="text-sm font-semibold text-neutral-600">← New</Link>
          <div className="text-center text-xs text-neutral-500">
            {busy ? "AI is writing…" : save === "saving" ? "Saving…" : save === "error" ? "⚠ Not saved — check connection" : published ? (dirty ? "Unpublished changes" : "Live ✓") : "Draft · saved"}
            {published && <span className="ml-1">· 👁 {stats.views}</span>}
          </div>
          <div className="flex gap-1.5" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t}
                aria-label={`${THEME_META[t].label} theme`}
                onClick={() => update((d) => ({ ...d, theme: t }))}
                className={`h-5 w-5 rounded-full border-2 border-ink ${draft.theme === t ? "ring-2 ring-violet ring-offset-1" : ""}`}
                style={{ background: THEME_META[t].swatch }}
              />
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md">
        {(banners.notice || banners.assumption || rec.source === "starter") && (
          <div className="space-y-2 px-4 pt-3">
            {(banners.notice || rec.source === "starter") && (
              <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                {banners.notice || "This is a starter draft. Tap “Regenerate all” to have AI write it for you."}
              </div>
            )}
            {banners.assumption && (
              <div className="flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">
                <span>💡</span>
                <span className="flex-1">{banners.assumption}</span>
                <button
                  onClick={() => {
                    setBanners((b) => ({ ...b, assumption: undefined }));
                    dismissFlash(id, "assumption");
                  }}
                  className="text-sky-700"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-between px-4 pt-3 text-xs text-neutral-500">
          <span>Tap any text to edit · ↻ for a new AI version</span>
          <button onClick={() => copy(editUrl, "edit-top")} className="font-semibold text-violet">
            {copied === "edit-top" ? "Copied ✓" : "🔗 Save edit link"}
          </button>
        </div>

        <div className="mt-2 overflow-hidden rounded-3xl shadow-sm">
          <StoreView
            store={draft}
            mode="edit"
            busy={busy}
            clicks={published ? stats.clicks : undefined}
            joins={published ? stats.waitlist : undefined}
            onEditProfile={() => setEditing({ kind: "profile" })}
            onEditProduct={(i) => setEditing({ kind: "product", i })}
            onRegen={(t) => regen(t)}
            onCta={(i) => setEditing({ kind: "product", i })}
          />
          <div className="px-4 pb-6" style={{ background: THEME_META[draft.theme].vars["--sf-bg"] }}>
            {draft.products.length < 4 && (
              <button onClick={() => regen("product:new")} disabled={!!busy} className="w-full rounded-2xl border-2 border-dashed border-ink/40 bg-white/70 py-4 text-sm font-semibold text-neutral-600 disabled:opacity-50">
                {busy === "product:new" ? "✨ Thinking of another idea…" : "+ Suggest another product"}
              </button>
            )}
          </div>
        </div>

        {/* Creator-only panels: never shown on the public page */}
        <div className="space-y-4 px-4 pb-36 pt-6">
          <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-neutral-400">Only you see this part</p>

          {/* Launch plan */}
          <section className="rounded-3xl bg-white p-5 brut">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold">🗓️ Your 2-week launch plan</h3>
              <button onClick={() => regen("plan")} disabled={!!busy} className="text-xs font-semibold text-violet disabled:opacity-50">
                {busy === "plan" ? "Rewriting…" : "↻ New plan"}
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {doneSteps.length}/{draft.plan.length} done. Your products don&apos;t exist yet, so this plan tests demand first, then builds what people asked for.
            </p>
            <ol className="mt-3 space-y-2">
              {draft.plan.map((s, i) => (
                <li key={i}>
                  <button onClick={() => toggleStep(i)} className="flex w-full items-start gap-3 rounded-xl p-2 text-left hover:bg-neutral-50">
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-[11px] ${doneSteps.includes(i) ? "border-ink bg-lime text-ink" : "border-neutral-300"}`}>{doneSteps.includes(i) ? "✓" : ""}</span>
                    <span className="flex-1">
                      <span className="text-xs font-bold text-violet">{s.when}</span>
                      <span className={`block text-sm ${doneSteps.includes(i) ? "text-neutral-400 line-through" : ""}`}>{s.action}</span>
                      {s.feature !== "none" && <span className="mt-1 inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">SuperProfile · {SP_FEATURE_LABEL[s.feature]}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          {/* Waitlist */}
          <section className="rounded-3xl bg-white p-5 brut">
            <h3 className="font-display text-lg font-extrabold">🙋 Waitlist {totalWaitlist > 0 && <span className="text-violet">· {totalWaitlist}</span>}</h3>
            {!published ? (
              <p className="mt-1 text-sm text-neutral-500">Publish your store. When followers tap a product, they join its waitlist and show up here, so you know what to make first.</p>
            ) : totalWaitlist === 0 ? (
              <p className="mt-1 text-sm text-neutral-500">No one yet. Share your link in your bio and stories. Each product button collects sign-ups.</p>
            ) : (
              <>
                <div className="mt-3 space-y-1.5">
                  {draft.products.map((p, i) => {
                    const n = stats.waitlist[i] || 0;
                    const max = Math.max(1, ...stats.waitlist);
                    return (
                      <div key={i} className="text-xs">
                        <div className="flex justify-between">
                          <span className="truncate pr-2">{p.title}</span>
                          <b>{n}</b>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-neutral-100">
                          <div className="h-1.5 rounded-full bg-violet" style={{ width: `${(n / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <ul className="mt-4 divide-y divide-neutral-100">
                  {waitlist
                    .slice()
                    .reverse()
                    .slice(0, 20)
                    .map((wl, i) => (
                      <li key={i} className="flex items-center justify-between py-2 text-sm">
                        <span>
                          <b>{wl.name}</b>
                          <span className="block text-xs text-neutral-500">{draft.products[wl.index]?.title || "Product"}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <a href={`https://wa.me/91${wl.phone}`} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#25D366] px-3 py-1 text-xs font-bold text-white">
                            WhatsApp
                          </a>
                          <button onClick={() => removeSignup(wl)} aria-label={`Remove ${wl.name}`} className="rounded-full border-2 border-ink/20 px-2 py-0.5 text-xs font-bold text-neutral-500">
                            ✕
                          </button>
                        </span>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </section>

          {/* Unlock next */}
          <section className="rounded-3xl bg-violet p-5 text-white brut">
            <h3 className="font-display text-lg font-extrabold">🔓 What to unlock next on SuperProfile</h3>
            <p className="mt-1 text-xs text-white/80">When a product has enough sign-ups, switch it from waitlist to selling.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {UNLOCKS.map((u) => (
                <div key={u.title} className="rounded-2xl border-2 border-ink bg-lime p-3 text-ink">
                  <div className="text-lg">{u.icon}</div>
                  <p className="mt-1 text-sm font-bold leading-tight">{u.title}</p>
                  <p className="mt-1 text-[11px] leading-snug text-ink/80">{u.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-white/70">Concept prototype: these are SuperProfile&apos;s existing features, shown here as the next step.</p>
          </section>
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-2 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button onClick={() => setRegenOpen(true)} disabled={!!busy} className="flex-1 rounded-2xl border-2 border-ink bg-white py-3.5 text-sm font-bold brut-sm press disabled:opacity-50">
            {busy === "all" ? "Rewriting…" : "↻ Regenerate all"}
          </button>
          {published && !dirty ? (
            <button onClick={() => setShareOpen(true)} className="flex-1 rounded-2xl bg-lime py-3.5 text-sm font-extrabold text-ink brut-sm press">
              Share link ↗
            </button>
          ) : (
            <button onClick={publish} disabled={!!busy || publishing} className="flex-1 rounded-2xl bg-violet py-3.5 text-sm font-extrabold text-white brut-sm press disabled:opacity-50">
              {publishing ? "Publishing…" : published ? "Update live page" : "Publish →"}
            </button>
          )}
        </div>
      </div>

      {/* Edit profile */}
      <Sheet
        open={editing?.kind === "profile"}
        onClose={() => setEditing(null)}
        title="Your profile"
        footer={<AiRewrite value={aiHint} onChange={setAiHint} onGo={() => regen("profile", aiHint)} busy={!!busy} placeholder="e.g. mention I'm a certified trainer" />}
      >
        <Field label="Name">
          <input className={inputCls} value={draft.creator.displayName} maxLength={60} onChange={(e) => update((d) => ({ ...d, creator: { ...d.creator, displayName: e.target.value } }), "name")} />
        </Field>
        <Field label="Tagline" hint="One line: who you help and how.">
          <input className={inputCls} value={draft.creator.tagline} maxLength={120} onChange={(e) => update((d) => ({ ...d, creator: { ...d.creator, tagline: e.target.value } }), "tagline")} />
        </Field>
        <Field label="Bio">
          <textarea className={`${inputCls} resize-none`} rows={4} value={draft.creator.bio} maxLength={500} onChange={(e) => update((d) => ({ ...d, creator: { ...d.creator, bio: e.target.value } }), "bio")} />
        </Field>
      </Sheet>

      {/* Edit product */}
      <Sheet
        open={!!editingProduct}
        onClose={() => setEditing(null)}
        title="Edit product"
        footer={editing?.kind === "product" && <AiRewrite value={aiHint} onChange={setAiHint} onGo={() => regen(`product:${editing.i}`, aiHint)} busy={!!busy} placeholder="e.g. make it a 4-week program" />}
      >
        {editingProduct && editing?.kind === "product" && (() => {
          const i = editing.i;
          const [min, max] = bandFor(editingProduct.format, rec.input.audience);
          return (
            <>
              <Field label="Title">
                <input className={inputCls} value={editingProduct.title} maxLength={100} onChange={(e) => setProduct(i, { title: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Format">
                  <select className={inputCls} value={editingProduct.format} onChange={(e) => setProduct(i, { format: e.target.value as Product["format"] })}>
                    {FORMATS.map((f) => (
                      <option key={f} value={f}>{FORMAT_LABEL[f]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Price (₹)">
                  <input className={inputCls} type="number" inputMode="numeric" min={0} max={100000} value={editingProduct.priceInr} onChange={(e) => setProduct(i, { priceInr: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                </Field>
              </div>
              <p className={`-mt-2 mb-4 text-xs ${editingProduct.priceInr < min || editingProduct.priceInr > max ? "text-amber-700" : "text-neutral-500"}`}>
                Suggested for your audience: {formatInr(min)}–{formatInr(max)}
                {editingProduct.priceInr > max && " · higher prices usually need more trust first"}
                {editingProduct.priceInr > 0 && editingProduct.priceInr < min && " · you may be underpricing this"}
              </p>
              {editingProduct.priceRationale && (
                <p className="mb-4 rounded-xl bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600">
                  <b>Why this price:</b> {editingProduct.priceRationale}
                </p>
              )}
              <Field label="Description">
                <textarea className={`${inputCls} resize-none`} rows={4} maxLength={600} value={editingProduct.description} onChange={(e) => setProduct(i, { description: e.target.value })} />
              </Field>
              <Field label="What's included">
                <div className="space-y-2">
                  {[0, 1, 2].map((j) => (
                    <input
                      key={j}
                      className={inputCls}
                      maxLength={80}
                      placeholder={`Point ${j + 1}`}
                      value={editingProduct.highlights[j] || ""}
                      onChange={(e) => {
                        const h = [...editingProduct.highlights];
                        h[j] = e.target.value;
                        setProduct(i, { highlights: h });
                      }}
                    />
                  ))}
                </div>
              </Field>
              <Field label="Button text">
                <input className={inputCls} maxLength={30} value={editingProduct.ctaLabel} onChange={(e) => setProduct(i, { ctaLabel: e.target.value })} />
              </Field>
              {draft.products.length > 1 && (
                <button
                  type="button"
                  className="mb-2 text-sm font-semibold text-red-600"
                  onClick={() => {
                    if (!confirm("Remove this product from your store?")) return;
                    setEditing(null);
                    update((d) => ({ ...d, products: d.products.filter((_, k) => k !== i) }));
                  }}
                >
                  Remove this product
                </button>
              )}
            </>
          );
        })()}
      </Sheet>

      {/* Regenerate all */}
      <Sheet open={regenOpen} onClose={() => setRegenOpen(false)} title="Regenerate the whole page">
        <p className="text-sm text-neutral-600">AI rewrites your bio and suggests new products. Your current version is replaced, so edit first if you love something.</p>
        <Field label="Anything to change? (optional)">
          <input className={inputCls} value={aiHint} onChange={(e) => setAiHint(e.target.value)} maxLength={200} placeholder="e.g. focus on beginners" />
        </Field>
        <div className="-mt-2 mb-4 flex flex-wrap gap-2">
          {REGEN_HINTS.map((h) => (
            <button key={h} type="button" onClick={() => setAiHint(h)} className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-medium">
              {h}
            </button>
          ))}
        </div>
        <Field label="Language">
          <div className="grid grid-cols-2 rounded-xl bg-neutral-100 p-1">
            {(["english", "hinglish"] as Language[]).map((l) => (
              <button type="button" key={l} onClick={() => update((d) => ({ ...d, language: l }))} className={`rounded-lg py-2 text-sm font-semibold ${draft.language === l ? "bg-white shadow" : "text-neutral-500"}`}>
                {l === "english" ? "English" : "Hinglish"}
              </button>
            ))}
          </div>
        </Field>
        <button onClick={() => regen("all", aiHint, draft.language)} className="w-full rounded-2xl bg-violet py-3.5 text-sm font-extrabold text-white brut-sm press">
          ✨ Regenerate everything
        </button>
      </Sheet>

      {/* Share */}
      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="🎉 Your store is live">
        <div className="rounded-xl bg-neutral-50 p-3 text-sm font-medium break-all">{publicUrl}</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => copy(publicUrl, "link")} className="rounded-xl bg-ink py-3 text-sm font-bold text-lime brut-sm press">
            {copied === "link" ? "Copied ✓" : "Copy link"}
          </button>
          <a href={`https://wa.me/?text=${encodeURIComponent(`Check out my new store: ${publicUrl}`)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#25D366] py-3 text-center text-sm font-bold text-white">
            WhatsApp
          </a>
        </div>
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block rounded-xl border-2 border-ink bg-white py-3 text-center text-sm font-bold brut-sm">
          Open my page ↗
        </a>
        <p className="mt-4 text-sm text-neutral-600">
          <b>Next:</b> put this link in your Instagram bio (Edit profile → Links), then post a story about your first product.
        </p>
        <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          There&apos;s no login yet, so save your private edit link to change your store later from any device.
          <button onClick={() => copy(editUrl, "edit")} className="mt-1 block font-bold underline underline-offset-2">
            {copied === "edit" ? "Copied ✓" : "Copy my private edit link"}
          </button>
        </div>
      </Sheet>

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div className="rounded-full border-2 border-lime bg-ink px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg">{toast}</div>
        </div>
      )}
    </main>
  );
}

function AiRewrite({ value, onChange, onGo, busy, placeholder }: { value: string; onChange: (v: string) => void; onGo: () => void; busy: boolean; placeholder: string }) {
  return (
    <div>
      <span className="text-xs font-semibold text-neutral-500">ASK AI TO REWRITE THIS</span>
      <div className="mt-1.5 flex gap-2">
        <input className={`${inputCls} flex-1`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={200} />
        <button onClick={onGo} disabled={busy} className="shrink-0 rounded-xl bg-violet px-4 text-sm font-bold text-white press disabled:opacity-50">
          ✨ Go
        </button>
      </div>
    </div>
  );
}
