"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import StoreView from "@/components/StoreView";
import Sheet, { Field, inputCls } from "@/components/Sheet";
import TopNav from "@/components/TopNav";
import { toAvatar } from "@/lib/image";
import { bandFor, formatInr } from "@/lib/pricing";
import { THEME_META } from "@/lib/themes";
import { CTA_OPTIONS, ctaOf, FORMAT_LABEL, FORMATS, THEMES, type CustomerRequest, type Language, type Product, type SavedStore, type Storefront } from "@/lib/types";

type Editing = { kind: "profile" } | { kind: "product"; i: number } | null;
type Confirm = { title: string; body: string; yes: string; run: () => void } | null;

const REGEN_HINTS = ["Different product ideas", "Lower prices", "More premium", "Shorter, punchier copy", "More personal tone"];
const ACTION_LABEL: Record<CustomerRequest["action"], string> = { waitlist: "Waitlist", slot: "Slot request", call: "Call request", question: "Question" };

export default function Studio({ id }: { id: string }) {
  const [rec, setRec] = useState<SavedStore | null>(null);
  const [draft, setDraft] = useState<Storefront | null>(null);
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [instagram, setInstagram] = useState<{ handle: string; status: string } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [aiHint, setAiHint] = useState("");
  const [regenOpen, setRegenOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [save, setSave] = useState<"saved" | "saving" | "error">("saved");
  const [toast, setToast] = useState("");
  const [notes, setNotes] = useState<{ assumption?: string; notice?: string }>({});
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Storefront | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  // ---- load from the creator's account ----
  useEffect(() => {
    fetch(`/api/stores/${id}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) return window.location.assign(`/login?mode=login&next=/studio/${id}`);
        const d = await r.json();
        if (!r.ok) return setLoadError(d.error || "We couldn't open this store.");
        setRec(d.store);
        setDraft(d.store.draft);
        setNotes(d.store.notes || {});
        setRequests((d.requests || []).slice().reverse());
        setInstagram(d.instagram);
      })
      .catch(() => setLoadError("We couldn't reach the server. Check your connection and refresh."));
  }, [id]);

  // ---- autosave to the account (debounced) ----
  const flush = useCallback(async (extra?: { clearNotes?: boolean }) => {
    const next = pending.current;
    if (!next && !extra) return;
    pending.current = null;
    setSave("saving");
    try {
      const r = await fetch(`/api/stores/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: next ?? undefined, ...extra }) });
      setSave(r.ok ? "saved" : "error");
    } catch {
      setSave("error");
    }
  }, [id]);

  const persist = useCallback((next: Storefront) => {
    pending.current = next;
    setSave("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => flush(), 700);
  }, [flush]);

  useEffect(() => {
    const onHide = () => {
      if (pending.current) navigator.sendBeacon?.(`/api/stores/${id}`, new Blob([JSON.stringify({ draft: pending.current })], { type: "application/json" }));
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [id]);

  const update = (fn: (d: Storefront) => Storefront) => {
    setDraft((d) => {
      if (!d) return d;
      const next = fn(structuredClone(d));
      persist(next);
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
      // Free AI tier cooling down: retry once by itself, keeping the shimmer on.
      if (r.status === 503 && data.retryAfter > 0 && data.retryAfter <= 50) {
        showToast(data.error);
        await new Promise((res) => setTimeout(res, (data.retryAfter + 1) * 1000));
        ({ r, data } = await call());
      }
      if (!r.ok) throw new Error(data.error || "Couldn't update that just now. Your store is unchanged.");
      setDraft(data.draft);
      persist(data.draft);
      if (target === "all") {
        setNotes({});
        flush({ clearNotes: true });
      }
      showToast(target === "all" ? "New version ready" : "Updated");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Something went wrong. Your store is unchanged.");
    } finally {
      setBusy(null);
    }
  }

  /** Anything that swaps out the creator's current words gets a heads-up first. */
  function askRegen(target: string, hint = "", language?: Language) {
    const what = target === "all" ? "your whole page (bio and all products)" : target === "profile" ? "your profile text" : target === "product:new" ? "" : "this product";
    if (target === "product:new") return regen(target, hint, language);
    setConfirm({
      title: "Replace the current version?",
      body: `We'll write a new version of ${what}. What's there now, including your edits, will be replaced and can't be brought back.`,
      yes: "Yes, write a new version",
      run: () => regen(target, hint, language),
    });
  }

  // ---- publish: checked on the server, then live at /s/<slug> ----
  async function publish() {
    if (!draft || !rec) return;
    setPublishing(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pending.current = null;
    try {
      const r = await fetch(`/api/stores/${id}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft }) });
      const data = await r.json().catch(() => ({}));
      if (r.status === 401) return window.location.assign(`/login?mode=login&next=/studio/${id}`);
      if (!r.ok) throw new Error(data.error || "Couldn't publish. Please try again.");
      setRec({ ...rec, draft, slug: data.slug, published: structuredClone(draft), publishedAt: data.publishedAt });
      setSave("saved");
      setShareOpen(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't publish. Please try again.");
    } finally {
      setPublishing(false);
    }
  }

  function askPublish() {
    if (!rec?.slug) return publish();
    setConfirm({
      title: "Update your live page?",
      body: "Your live page will switch to this version right away. Anyone who opens your link will see the new version, and the old one will be gone.",
      yes: "Update live page",
      run: publish,
    });
  }

  // ---- states ----
  if (loadError) {
    return (
      <main className="min-h-dvh bg-[#F7F7FB]">
        <TopNav />
        <div className="mx-auto max-w-sm px-6 pt-24 text-center">
          <p className="text-4xl">🧭</p>
          <p className="mt-4 text-base">{loadError}</p>
          <Link href="/dashboard" className="mt-6 inline-block rounded-xl bg-violet px-5 py-3 text-sm font-semibold text-white">
            Go to My stores
          </Link>
        </div>
      </main>
    );
  }
  if (!rec || !draft) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-violet" />
      </main>
    );
  }

  const published = !!rec.slug;
  const norm = (x: Storefront | null) => (x ? JSON.stringify({ ...x, plan: [], creator: { ...x.creator, whatsapp: "" } }) : "");
  const dirty = published && norm(rec.published) !== norm(draft);
  const publicUrl = rec.slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/s/${rec.slug}` : "";
  const editingProduct = editing?.kind === "product" ? draft.products[editing.i] : null;
  const setProduct = (i: number, patch: Partial<Product>) =>
    update((d) => {
      d.products[i] = { ...d.products[i], ...patch };
      return d;
    });

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Couldn't copy. Press and hold the link to copy it.");
    }
  }

  const status = busy ? "Generating…" : save === "saving" ? "Saving…" : save === "error" ? "⚠ Not saved. Check your connection" : published ? (dirty ? "Changes not live yet" : "Live ✓") : "Draft saved";

  return (
    <main className="min-h-dvh bg-paper dotted">
      <TopNav
        maxW="max-w-md"
        right={
          <Link href="/dashboard" className="px-2 py-1.5 font-medium text-neutral-600 hover:text-ink">
            My stores
          </Link>
        }
      />
      <div className="sticky top-[49px] z-20 border-b border-neutral-200 bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-2">
          <span className="text-xs font-medium text-neutral-500">{status}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setReqOpen(true)} className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700">
              🙋 Requests {requests.length > 0 && <span className="ml-0.5 rounded-full bg-violet px-1.5 text-white">{requests.length}</span>}
            </button>
            <div className="flex gap-1" aria-label="Theme">
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
        </div>
      </div>

      <div className="mx-auto max-w-md">
        {(notes.notice || notes.assumption || rec.source === "starter") && (
          <div className="space-y-2 px-4 pt-3">
            {(notes.notice || rec.source === "starter") && (
              <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                {notes.notice || "This is a starter version. Tap “Regenerate all” for one written around your answers."}
              </div>
            )}
            {notes.assumption && (
              <div className="flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">
                <span>💡</span>
                <span className="flex-1">{notes.assumption}</span>
                <button
                  onClick={() => {
                    setNotes((b) => ({ ...b, assumption: undefined }));
                    flush({ clearNotes: true });
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

        <div className="mt-3 overflow-hidden rounded-3xl shadow-sm">
          <StoreView
            store={draft}
            mode="edit"
            verified={instagram?.status === "verified" ? instagram.handle : null}
            busy={busy}
            onEditProfile={() => setEditing({ kind: "profile" })}
            onEditProduct={(i) => setEditing({ kind: "product", i })}
            onRegen={(t) => askRegen(t)}
            onCta={(i) => setEditing({ kind: "product", i })}
          />
          <div className="px-4 pb-6" style={{ background: THEME_META[draft.theme].vars["--sf-bg"] }}>
            {draft.products.length < 4 && (
              <button onClick={() => askRegen("product:new")} disabled={!!busy} className="w-full rounded-2xl border border-dashed border-neutral-300 bg-white/70 py-4 text-sm font-semibold text-neutral-600 disabled:opacity-50">
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
            <button onClick={askPublish} disabled={!!busy || publishing} className="flex-1 rounded-2xl bg-violet py-3.5 text-sm font-bold text-white brut-sm press disabled:opacity-50">
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
        footer={<AiRewrite value={aiHint} onChange={setAiHint} onGo={() => askRegen("profile", aiHint)} busy={!!busy} placeholder="e.g. mention I'm a certified trainer" />}
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
                  update((d) => ({ ...d, creator: { ...d.creator, avatar: data } }));
                }}
              />
            </label>
            {draft.creator.avatar && (
              <button onClick={() => update((d) => ({ ...d, creator: { ...d.creator, avatar: "" } }))} className="ml-2 text-sm text-neutral-500">
                Remove
              </button>
            )}
          </div>
        </div>
        <Field label="Name">
          <input className={inputCls} value={draft.creator.displayName} maxLength={60} onChange={(e) => update((d) => ({ ...d, creator: { ...d.creator, displayName: e.target.value } }))} />
        </Field>
        <Field label="Tagline" hint="One line: who you help and how.">
          <input className={inputCls} value={draft.creator.tagline} maxLength={120} onChange={(e) => update((d) => ({ ...d, creator: { ...d.creator, tagline: e.target.value } }))} />
        </Field>
        <Field label="Bio">
          <textarea className={`${inputCls} resize-none`} rows={4} value={draft.creator.bio} maxLength={500} onChange={(e) => update((d) => ({ ...d, creator: { ...d.creator, bio: e.target.value } }))} />
        </Field>
        <div className="mb-2 rounded-xl bg-neutral-50 p-3 text-sm">
          {instagram?.status === "verified" ? (
            <span>
              ✓ Instagram <b>@{instagram.handle}</b> is verified and shows on your page.
            </span>
          ) : (
            <span>
              {instagram?.status === "pending" ? `Instagram @${instagram.handle} is in review.` : "Get a verified Instagram badge on your page."}{" "}
              <Link href="/dashboard" className="font-semibold text-violet underline">
                {instagram?.status === "pending" ? "See code" : "Verify now"}
              </Link>
            </span>
          )}
        </div>
      </Sheet>

      {/* Edit product */}
      <Sheet
        open={!!editingProduct}
        onClose={() => setEditing(null)}
        title="Edit product"
        footer={editing?.kind === "product" && <AiRewrite value={aiHint} onChange={setAiHint} onGo={() => askRegen(`product:${editing.i}`, aiHint)} busy={!!busy} placeholder="e.g. make it a 4-week program" />}
      >
        {editingProduct &&
          editing?.kind === "product" &&
          (() => {
            const i = editing.i;
            const [min, max] = bandFor(editingProduct.format, rec.input.audience);
            const current = ctaOf(editingProduct);
            return (
              <>
                <Field label="Title">
                  <input className={inputCls} value={editingProduct.title} maxLength={100} onChange={(e) => setProduct(i, { title: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Format">
                    <select className={inputCls} value={editingProduct.format} onChange={(e) => setProduct(i, { format: e.target.value as Product["format"] })}>
                      {FORMATS.map((f) => (
                        <option key={f} value={f}>
                          {FORMAT_LABEL[f]}
                        </option>
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
                <div className="mb-4">
                  <span className="text-sm font-semibold">Button</span>
                  <p className="mt-0.5 text-xs text-neutral-500">What customers tap, and what happens next.</p>
                  <div className="mt-2 space-y-1.5" role="radiogroup" aria-label="Button">
                    {CTA_OPTIONS.map((c) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={current.label === c.label}
                        key={c.label}
                        onClick={() => setProduct(i, { ctaLabel: c.label })}
                        className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left ${current.label === c.label ? "border-violet bg-violet/5 ring-1 ring-violet" : "border-neutral-200"}`}
                      >
                        <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${current.label === c.label ? "border-violet bg-violet shadow-[inset_0_0_0_2px_white]" : "border-neutral-300"}`} />
                        <span>
                          <span className="block text-sm font-semibold">{c.label}</span>
                          <span className="block text-xs text-neutral-500">{c.what}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                {draft.products.length > 1 && (
                  <button
                    type="button"
                    className="mb-2 text-sm font-semibold text-red-600"
                    onClick={() =>
                      setConfirm({
                        title: "Remove this product?",
                        body: `“${editingProduct.title}” will be taken off your store. This can't be undone.`,
                        yes: "Remove product",
                        run: () => {
                          setEditing(null);
                          update((d) => ({ ...d, products: d.products.filter((_, k) => k !== i) }));
                        },
                      })
                    }
                  >
                    Remove this product
                  </button>
                )}
              </>
            );
          })()}
      </Sheet>

      {/* Regenerate all */}
      <Sheet open={regenOpen} onClose={() => setRegenOpen(false)} title="Regenerate the whole page" done={false}>
        <p className="text-sm text-neutral-600">Writes a new bio and new products for you.</p>
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
        <button onClick={() => askRegen("all", aiHint, draft.language)} className="w-full rounded-2xl bg-violet py-3.5 text-sm font-bold text-white brut-sm press">
          Regenerate everything
        </button>
      </Sheet>

      {/* Share */}
      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="🎉 Your store is live">
        <div className="rounded-xl bg-neutral-50 p-3 text-sm font-medium break-all">{publicUrl}</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => copy(publicUrl)} className="rounded-xl bg-violet py-3 text-sm font-semibold text-white brut-sm press">
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          <a href={`https://wa.me/?text=${encodeURIComponent(publicUrl)}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#25D366] py-3 text-center text-sm font-bold text-white">
            Share on WhatsApp
          </a>
        </div>
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block rounded-xl border border-neutral-200 bg-white py-3 text-center text-sm font-bold brut-sm">
          Open my page ↗
        </a>
      </Sheet>

      {/* Customer requests */}
      <Sheet open={reqOpen} onClose={() => setReqOpen(false)} title="Customer requests">
        {requests.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-600">{published ? "No requests yet. Share your link to start collecting them." : "Publish your store to start collecting requests."}</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {requests.map((q, k) => (
              <li key={k} className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{q.name}</span>
                  <a href={`tel:+91${q.phone}`} className="font-medium text-violet">
                    +91 {q.phone}
                  </a>
                </div>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {ACTION_LABEL[q.action]} · {q.product} · {new Date(q.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </p>
                {q.message && <p className="mt-1 rounded-lg bg-neutral-50 p-2 text-xs">{q.message}</p>}
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      {/* Replace / update warning */}
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title || ""} done={false}>
        <p className="text-sm leading-relaxed text-neutral-700">{confirm?.body}</p>
        <div className="mt-5 grid grid-cols-2 gap-2 pb-1">
          <button onClick={() => setConfirm(null)} className="rounded-xl border border-neutral-200 py-3 text-sm font-semibold">
            Keep current
          </button>
          <button
            onClick={() => {
              const run = confirm?.run;
              setConfirm(null);
              run?.();
            }}
            className="rounded-xl bg-violet py-3 text-sm font-semibold text-white"
          >
            {confirm?.yes}
          </button>
        </div>
      </Sheet>

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
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
        <button onClick={onGo} disabled={busy || !value.trim()} className="shrink-0 rounded-xl bg-violet px-4 text-sm font-semibold text-white disabled:opacity-50">
          Go
        </button>
      </div>
    </div>
  );
}
