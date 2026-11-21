"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import StoreView from "@/components/StoreView";
import Sheet, { Field, inputCls } from "@/components/Sheet";
import { toAvatar } from "@/lib/image";
import { dismissFlash, getLocalStore, readFlash, saveLocalStore, type LocalStore } from "@/lib/local";
import { bandFor, formatInr } from "@/lib/pricing";
import { THEME_META } from "@/lib/themes";
import { FORMAT_LABEL, FORMATS, THEMES, type Language, type Product, type Storefront } from "@/lib/types";

type Editing = { kind: "profile" } | { kind: "product"; i: number } | null;

const REGEN_HINTS = ["Different product ideas", "Lower prices", "More premium", "Shorter, punchier copy", "More personal tone"];

export default function Studio({ id }: { id: string }) {
  const [rec, setRec] = useState<LocalStore | null>(null);
  const [draft, setDraft] = useState<Storefront | null>(null);
  const [loadError, setLoadError] = useState(false);
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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  // ---- load from this device (no database) ----
  useEffect(() => {
    const r = getLocalStore(id);
    if (!r) {
      // localStorage only exists in the browser, so this runs after mount.
       
      setLoadError(true);
      return;
    }
    setRec(r);
    setDraft({ ...r.draft, plan: r.draft.plan || [] });
    const flash = readFlash(id);
    if (flash) setBanners(flash);
  }, [id]);

  // ---- autosave to this device ----
  const persist = useCallback((next: Storefront, field?: string) => {
    setRec((r) => {
      if (!r) return r;
      const edits = field ? { ...r.edits, [field]: (r.edits[field] || 0) + 1 } : r.edits;
      const u: LocalStore = { ...r, draft: next, edits, updatedAt: Date.now() };
      setSave(saveLocalStore(u) ? "saved" : "error");
      return u;
    });
  }, []);

  /** `field` names what the creator changed, for the edit-depth metric (which AI fields people fix). */
  const update = (fn: (d: Storefront) => Storefront, field?: string) => {
    setDraft((d) => {
      if (!d) return d;
      const next = fn(structuredClone(d));
      persist(next, field);
      return next;
    });
  };

  // ---- AI regenerate (whole page or one part) ----
  async function regen(target: string, hint = "", language?: Language) {
    if (!draft || !rec || busy) return;
    setBusy(target);
    setEditing(null);
    setRegenOpen(false);
    setAiHint("");
    const body = { target, hint, input: rec.input, draft: language ? { ...draft, language } : draft };
    try {
      const call = async () => {
        const r = await fetch(`/api/regenerate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        return { r, data: await r.json().catch(() => ({})) };
      };
      let { r, data } = await call();
      // Free AI tier cooling down: tell the creator and retry once by itself, keeping the shimmer on.
      if (r.status === 503 && data.retryAfter > 0 && data.retryAfter <= 50) {
        showToast(data.error);
        await new Promise((res) => setTimeout(res, (data.retryAfter + 1) * 1000));
        ({ r, data } = await call());
      }
      if (!r.ok) throw new Error(data.error || "Couldn't update that just now. Your store is unchanged.");
      setDraft(data.draft);
      persist(data.draft);
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

  // ---- publish: the server checks the draft and returns a self-contained share link ----
  async function publish() {
    if (!draft || !rec) return;
    if (!draft.creator.whatsapp) {
      setEditing({ kind: "profile" });
      return showToast("Add your WhatsApp number so customers' requests reach you.");
    }
    setPublishing(true);
    try {
      const r = await fetch(`/api/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, input: rec.input, first: !rec.publicPath }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Couldn't publish. Please try again.");
      const u: LocalStore = { ...rec, draft, publicPath: data.path, shortUrl: data.short || "", publishedDraft: structuredClone(draft), updatedAt: Date.now() };
      saveLocalStore(u);
      setRec(u);
      setShareOpen(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't publish. Please try again.");
    } finally {
      setPublishing(false);
    }
  }

  // ---- states ----
  if (loadError) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <p className="text-4xl">🧭</p>
          <p className="mt-4 text-base">We couldn&apos;t find this draft on this device. Drafts are saved in the browser you built them in.</p>
          <Link href="/" className="mt-6 inline-block rounded-xl bg-violet px-5 py-3 text-sm font-semibold text-white">
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

  const published = !!rec.publicPath;
  const dirty = published && JSON.stringify(rec.publishedDraft) !== JSON.stringify(draft);
  const publicUrl = rec.shortUrl || (rec.publicPath ? (typeof window !== "undefined" ? `${window.location.origin}${rec.publicPath}` : rec.publicPath) : "");
  const editingProduct = editing?.kind === "product" ? draft.products[editing.i] : null;

  const setProduct = (i: number, patch: Partial<Product>) =>
    update((d) => {
      d.products[i] = { ...d.products[i], ...patch };
      return d;
    }, Object.keys(patch)[0]);


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
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-2.5">
          <Link href="/" className="text-sm font-semibold text-neutral-600">← New</Link>
          <div className="text-center text-xs text-neutral-500">
            {busy ? "Generating…" : save === "saving" ? "Saving…" : save === "error" ? "⚠ Not saved — check connection" : published ? (dirty ? "Unpublished changes" : "Live ✓") : "Draft · saved"}
          </div>
          <div className="flex gap-1.5" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t}
                aria-label={`${THEME_META[t].label} theme`}
                onClick={() => update((d) => ({ ...d, theme: t }))}
                className={`h-5 w-5 rounded-full border border-neutral-200 ${draft.theme === t ? "ring-2 ring-violet ring-offset-1" : ""}`}
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
                {banners.notice || "This is a starter version. Tap “Regenerate all” for a more tailored one."}
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
          <span>Tap any text to edit · ↻ for a new version</span>
          <span>💾 Saved on this device</span>
        </div>

        <div className="mt-2 overflow-hidden rounded-3xl shadow-sm">
          <StoreView
            store={draft}
            mode="edit"
            busy={busy}
            onEditProfile={() => setEditing({ kind: "profile" })}
            onEditProduct={(i) => setEditing({ kind: "product", i })}
            onRegen={(t) => regen(t)}
            onCta={(i) => setEditing({ kind: "product", i })}
          />
          <div className="px-4 pb-6" style={{ background: THEME_META[draft.theme].vars["--sf-bg"] }}>
            {draft.products.length < 4 && (
              <button onClick={() => regen("product:new")} disabled={!!busy} className="w-full rounded-2xl border border-dashed border-neutral-300 bg-white/70 py-4 text-sm font-semibold text-neutral-600 disabled:opacity-50">
                {busy === "product:new" ? "Generating another idea…" : "+ Suggest another product"}
              </button>
            )}
          </div>
        </div>

        <div className="pb-32" />
      </div>

      {/* Bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-md gap-2 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button onClick={() => setRegenOpen(true)} disabled={!!busy} className="flex-1 rounded-2xl border border-neutral-200 bg-white py-3.5 text-sm font-bold brut-sm press disabled:opacity-50">
            {busy === "all" ? "Generating…" : "↻ Regenerate all"}
          </button>
          {published && !dirty ? (
            <button onClick={() => setShareOpen(true)} className="flex-1 rounded-2xl bg-violet py-3.5 text-sm font-semibold text-white brut-sm press">
              Share link ↗
            </button>
          ) : (
            <button onClick={publish} disabled={!!busy || publishing} className="flex-1 rounded-2xl bg-violet py-3.5 text-sm font-bold text-white brut-sm press disabled:opacity-50">
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
        <div className="mb-4 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet/10 text-xl font-semibold text-violet">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {draft.creator.avatar ? <img src={draft.creator.avatar} alt="" className="h-full w-full object-cover" /> : (draft.creator.displayName.trim()[0] || "?").toUpperCase()}
          </div>
          <div>
            <label className="cursor-pointer rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50">
              {draft.creator.avatar ? "Change photo" : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const data = await toAvatar(f).catch(() => "");
                  if (!data) return showToast("Couldn't use that photo. Try another.");
                  update((d) => ({ ...d, creator: { ...d.creator, avatar: data } }), "avatar");
                }}
              />
            </label>
            {draft.creator.avatar && (
              <button onClick={() => update((d) => ({ ...d, creator: { ...d.creator, avatar: "" } }), "avatar")} className="ml-2 text-sm text-neutral-500">
                Remove
              </button>
            )}
          </div>
        </div>
        <Field label="Name">
          <input className={inputCls} value={draft.creator.displayName} maxLength={60} onChange={(e) => update((d) => ({ ...d, creator: { ...d.creator, displayName: e.target.value } }), "name")} />
        </Field>
        <Field label="Tagline" hint="One line: who you help and how.">
          <input className={inputCls} value={draft.creator.tagline} maxLength={120} onChange={(e) => update((d) => ({ ...d, creator: { ...d.creator, tagline: e.target.value } }), "tagline")} />
        </Field>
        <Field label="Bio">
          <textarea className={`${inputCls} resize-none`} rows={4} value={draft.creator.bio} maxLength={500} onChange={(e) => update((d) => ({ ...d, creator: { ...d.creator, bio: e.target.value } }), "bio")} />
        </Field>
        <Field label="WhatsApp number" hint="Customers' waitlist and slot requests reach you here.">
          <input
            className={inputCls}
            inputMode="numeric"
            maxLength={14}
            defaultValue={draft.creator.whatsapp || ""}
            onBlur={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(-10);
              if (!/^[6-9]\d{9}$/.test(digits)) return showToast("Enter a 10-digit Indian mobile number.");
              update((d) => ({ ...d, creator: { ...d.creator, whatsapp: digits } }), "whatsapp");
            }}
          />
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
        <p className="text-sm text-neutral-600">Rewrites your bio and suggests new products. Your current version is replaced, so edit first if you love something.</p>
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
        <button onClick={() => regen("all", aiHint, draft.language)} className="w-full rounded-2xl bg-violet py-3.5 text-sm font-bold text-white brut-sm press">
          ✨ Regenerate everything
        </button>
      </Sheet>

      {/* Share */}
      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="🎉 Your store is live">
        <div className="rounded-xl bg-neutral-50 p-3 text-sm font-medium break-all">{publicUrl}</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => copy(publicUrl, "link")} className="rounded-xl bg-violet py-3 text-sm font-semibold text-white brut-sm press">
            {copied === "link" ? "Copied ✓" : "Copy link"}
          </button>
          <a href={`https://wa.me/?text=${encodeURIComponent(`Check out my new store: ${publicUrl}`)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#25D366] py-3 text-center text-sm font-bold text-white">
            WhatsApp
          </a>
        </div>
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block rounded-xl border border-neutral-200 bg-white py-3 text-center text-sm font-bold brut-sm">
          Open my page ↗
        </a>
        <p className="mt-4 text-sm text-neutral-600">
          <b>Next:</b> put this link in your Instagram bio (Edit profile → Links), then post a story about your first product.
        </p>
        <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          No login yet: your draft is saved on this device. Edit and tap &ldquo;Update live page&rdquo; to get a fresh link with your changes.
          {!draft.creator.whatsapp && " Tip: add your WhatsApp number in the editor so waitlist requests reach you."}
        </div>
      </Sheet>

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div className="rounded-full bg-ink px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg">{toast}</div>
        </div>
      )}
    </main>
  );
}

function AiRewrite({ value, onChange, onGo, busy, placeholder }: { value: string; onChange: (v: string) => void; onGo: () => void; busy: boolean; placeholder: string }) {
  return (
    <div>
      <span className="text-xs font-semibold text-neutral-500">WANT IT DIFFERENT? DESCRIBE THE CHANGE</span>
      <div className="mt-1.5 flex gap-2">
        <input className={`${inputCls} flex-1`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={200} />
        <button onClick={onGo} disabled={busy} className="shrink-0 rounded-xl bg-violet px-4 text-sm font-semibold text-white disabled:opacity-50">
          ✨ Go
        </button>
      </div>
    </div>
  );
}
