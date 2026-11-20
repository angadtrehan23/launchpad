"use client";

import { useEffect, useRef, useState } from "react";
import StoreView from "@/components/StoreView";
import Sheet, { Field, inputCls } from "@/components/Sheet";
import { formatInr } from "@/lib/pricing";
import { BOOKABLE, type Storefront } from "@/lib/types";

function send(slug: string, kind: "view" | "click", index = 0) {
  const body = JSON.stringify({ slug, kind, index });
  try {
    if (navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) return;
  } catch {}
  fetch("/api/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
}

export default function PublicStore({ store, slug }: { store: Storefront; slug: string }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    send(slug, "view");
  }, [slug]);

  const product = picked !== null ? store.products[picked] : null;
  const bookable = product ? BOOKABLE.includes(product.format) : false;
  const first = store.creator.displayName.split(" ")[0] || "the creator";

  async function join() {
    if (picked === null) return;
    setError("");
    setState("sending");
    try {
      const r = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, index: picked, name, phone, consent }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Couldn't save that. Please try again.");
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that. Please try again.");
      setState("idle");
    }
  }

  return (
    <>
      <StoreView
        store={store}
        mode="public"
        onCta={(i) => {
          send(slug, "click", i);
          setPicked(i);
          setState("idle");
          setError("");
        }}
      />
      <Sheet open={!!product} onClose={() => setPicked(null)} title={product?.title || ""}>
        {product &&
          (state === "done" ? (
            <div className="py-4 text-center">
              <p className="text-4xl">🎉</p>
              <p className="mt-3 text-lg font-bold">You&apos;re on the list!</p>
              <p className="mt-1 text-sm text-neutral-600">
                {first} will message you on WhatsApp {bookable ? "to fix a slot" : "as soon as it's ready"}. Early sign-ups get the {formatInr(product.priceInr)} price.
              </p>
            </div>
          ) : (
            <div className="pb-2">
              <p className="text-sm text-neutral-600">
                {bookable
                  ? `${first} is opening a few slots. Leave your details and they'll WhatsApp you to fix a time.`
                  : `${first} is putting this together now. Join the waitlist to get it first at the early price.`}
              </p>
              <p className="mb-4 mt-3 text-2xl font-extrabold">{product.priceInr > 0 ? formatInr(product.priceInr) : "Free"}</p>
              <Field label="Your name">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />
              </Field>
              <Field label="WhatsApp number">
                <div className="flex items-center rounded-xl border border-neutral-200 bg-neutral-50 px-3 focus-within:border-neutral-400">
                  <span className="text-neutral-500">+91</span>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" autoComplete="tel-national" maxLength={14} placeholder="98765 43210" className="w-full bg-transparent px-2 py-2.5 text-base outline-none" />
                </div>
              </Field>
              <label className="mb-4 flex items-start gap-2 text-xs text-neutral-600">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4" />
                <span>Share my name and number with {store.creator.displayName} so they can message me about this. Not shared with anyone else.</span>
              </label>
              {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
              <button onClick={join} disabled={state === "sending"} className="w-full rounded-2xl bg-violet py-3.5 text-sm font-extrabold text-white brut-sm press disabled:opacity-50">
                {state === "sending" ? "Saving…" : bookable ? "Request a slot" : "Join the waitlist"}
              </button>
            </div>
          ))}
      </Sheet>
    </>
  );
}
