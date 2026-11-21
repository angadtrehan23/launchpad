"use client";

import { useEffect, useState } from "react";
import StoreView from "@/components/StoreView";
import Sheet, { Field, inputCls } from "@/components/Sheet";
import { formatInr } from "@/lib/pricing";
import { ctaOf, type CtaAction, type Storefront } from "@/lib/types";

const COPY: Record<CtaAction, { title: string; submit: string; promise: (first: string) => string; done: (first: string) => string }> = {
  waitlist: { title: "Join the waitlist", submit: "Join the waitlist", promise: (f) => `${f} will let you know as soon as it's ready.`, done: (f) => `You're on the list. ${f} will contact you when it launches.` },
  slot: { title: "Request a slot", submit: "Request my slot", promise: (f) => `${f} will contact you to fix a time.`, done: (f) => `Request sent. ${f} will contact you to fix a time.` },
  call: { title: "Book a free call", submit: "Request a call", promise: (f) => `${f} will call you back to talk it through.`, done: (f) => `Request sent. ${f} will call you back soon.` },
  question: { title: "Ask a question", submit: "Send my question", promise: (f) => `${f} will reply to you directly.`, done: (f) => `Question sent. ${f} will get back to you.` },
};

/** Customer taps a product button → leaves name + number → it's saved to the creator's account. */
export default function PublicStore({ store, slug, verified }: { store: Storefront; slug: string | null; verified: string | null }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (slug) navigator.sendBeacon?.("/api/track", new Blob([JSON.stringify({ slug, kind: "view" })], { type: "application/json" }));
  }, [slug]);

  const product = picked !== null ? store.products[picked] : null;
  const cta = product ? ctaOf(product) : null;
  const copy = cta ? COPY[cta.action] : null;
  const first = store.creator.displayName.split(" ")[0] || "The creator";

  async function submit() {
    if (picked === null || !cta) return;
    const digits = phone.replace(/\D/g, "").slice(-10);
    if (name.trim().length < 2) return setError("Please enter your name.");
    if (!/^[6-9]\d{9}$/.test(digits)) return setError("Please enter a 10-digit Indian mobile number.");
    if (cta.action === "question" && message.trim().length < 3) return setError("Please type your question.");
    if (!consent) return setError(`Please tick the box so ${first} can contact you.`);
    if (!slug) return setError("This is an old link that can't take requests. Ask the creator for their new link.");
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, index: picked, name, phone: digits, message, consent }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Couldn't send that. Please try again.");
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <StoreView
        store={store}
        mode="public"
        verified={verified}
        onCta={(i) => {
          setPicked(i);
          setSent(false);
          setError("");
          if (slug) navigator.sendBeacon?.("/api/track", new Blob([JSON.stringify({ slug, kind: "click", index: i })], { type: "application/json" }));
        }}
      />
      <Sheet open={!!product} onClose={() => setPicked(null)} title={copy?.title || ""} done={sent}>
        {product && copy &&
          (sent ? (
            <div className="py-6 text-center">
              <p className="text-3xl">✅</p>
              <p className="mt-3 text-lg font-semibold text-ink">Done!</p>
              <p className="mt-2 text-sm text-neutral-600">{copy.done(first)}</p>
            </div>
          ) : (
            <div className="pb-2">
              <p className="text-sm font-semibold text-ink">{product.title}</p>
              <p className="mt-0.5 text-sm text-neutral-600">
                {product.priceInr > 0 ? formatInr(product.priceInr) : "Free"} · {copy.promise(first)}
              </p>
              <div className="mt-4">
                <Field label="Your name">
                  <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />
                </Field>
                <Field label="Your mobile number">
                  <div className="flex items-center rounded-xl border border-neutral-200 bg-neutral-50 px-3 focus-within:border-violet">
                    <span className="text-neutral-500">+91</span>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" autoComplete="tel-national" maxLength={14} placeholder="98765 43210" className="w-full bg-transparent px-2 py-2.5 text-base outline-none" />
                  </div>
                </Field>
                {cta?.action === "question" && (
                  <Field label="Your question">
                    <textarea className={`${inputCls} resize-none`} rows={3} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} />
                  </Field>
                )}
                <label className="mb-4 flex items-start gap-2 text-xs text-neutral-600">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-violet" />
                  <span>Share my name and number with {store.creator.displayName} so they can contact me about this. Not shared with anyone else.</span>
                </label>
              </div>
              {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
              <button onClick={submit} disabled={busy} className="w-full rounded-xl bg-violet py-3.5 text-sm font-semibold text-white hover:bg-violet/90 disabled:opacity-60">
                {busy ? "Sending…" : copy.submit}
              </button>
            </div>
          ))}
      </Sheet>
    </>
  );
}
