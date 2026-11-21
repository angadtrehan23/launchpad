"use client";

import { useState } from "react";
import StoreView from "@/components/StoreView";
import Sheet, { Field, inputCls } from "@/components/Sheet";
import { formatInr } from "@/lib/pricing";
import { BOOKABLE, type Storefront } from "@/lib/types";

/**
 * Waitlist / slot request without a database: the customer fills in their name and number,
 * and we hand the request to the creator's WhatsApp as a ready-to-send message.
 * Nothing is stored by us; the customer sends it themselves.
 */
export default function PublicStore({ store }: { store: Storefront }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const product = picked !== null ? store.products[picked] : null;
  const bookable = product ? BOOKABLE.includes(product.format) : false;
  const first = store.creator.displayName.split(" ")[0] || "the creator";
  const wa = store.creator.whatsapp;

  function submit() {
    if (!product) return;
    const digits = phone.replace(/\D/g, "").slice(-10);
    if (name.trim().length < 2) return setError("Please enter your name.");
    if (!/^[6-9]\d{9}$/.test(digits)) return setError("Please enter a 10-digit Indian mobile number.");
    if (!consent) return setError("Please tick the box so we can share your details with the creator.");
    setError("");
    const msg = bookable
      ? `Hi ${first}! I'd like to request a slot for "${product.title}" (${formatInr(product.priceInr)}).\n\nName: ${name.trim()}\nWhatsApp: +91 ${digits}`
      : `Hi ${first}! Please add me to the waitlist for "${product.title}" (${formatInr(product.priceInr)}).\n\nName: ${name.trim()}\nWhatsApp: +91 ${digits}`;
    const url = wa ? `https://wa.me/91${wa}?text=${encodeURIComponent(msg)}` : store.creator.handle ? `https://ig.me/m/${store.creator.handle}` : "";
    setSent(true);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <StoreView
        store={store}
        mode="public"
        onCta={(i) => {
          setPicked(i);
          setSent(false);
          setError("");
        }}
      />
      <Sheet open={!!product} onClose={() => setPicked(null)} title={product ? (bookable ? "Request a slot" : "Join the waitlist") : ""}>
        {product &&
          (sent ? (
            <div className="py-4 text-center">
              <p className="text-lg font-semibold text-ink">Almost done</p>
              <p className="mt-2 text-sm text-neutral-600">WhatsApp should have opened with your request to {first}. Tap <b>Send</b> there to confirm.</p>
              <button onClick={submit} className="mt-4 text-sm font-medium text-violet underline">
                WhatsApp didn&apos;t open? Try again
              </button>
            </div>
          ) : (
            <div className="pb-2">
              <p className="text-sm font-semibold text-ink">{product.title}</p>
              <p className="mt-0.5 text-sm text-neutral-600">
                {product.priceInr > 0 ? formatInr(product.priceInr) : "Free"} ·{" "}
                {bookable ? `${first} will message you to fix a time.` : `${first} will let you know as soon as it's ready.`}
              </p>
              <div className="mt-4">
                <Field label="Your name">
                  <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />
                </Field>
                <Field label="Your WhatsApp number">
                  <div className="flex items-center rounded-xl border border-neutral-200 bg-neutral-50 px-3 focus-within:border-violet">
                    <span className="text-neutral-500">+91</span>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" autoComplete="tel-national" maxLength={14} placeholder="98765 43210" className="w-full bg-transparent px-2 py-2.5 text-base outline-none" />
                  </div>
                </Field>
                <label className="mb-4 flex items-start gap-2 text-xs text-neutral-600">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-violet" />
                  <span>Share my name and number with {store.creator.displayName} so they can contact me about this. Not shared with anyone else.</span>
                </label>
              </div>
              {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
              <button onClick={submit} className="w-full rounded-xl bg-violet py-3.5 text-sm font-semibold text-white hover:bg-violet/90">
                {bookable ? "Request my slot" : "Join the waitlist"}
              </button>
              <p className="mt-2 text-center text-xs text-neutral-500">Your request is sent to {first} on WhatsApp.</p>
            </div>
          ))}
      </Sheet>
    </>
  );
}
