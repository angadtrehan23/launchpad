"use client";

import { useState } from "react";
import StoreView from "@/components/StoreView";
import Sheet from "@/components/Sheet";
import { formatInr } from "@/lib/pricing";
import { BOOKABLE, type Storefront } from "@/lib/types";

/**
 * Waitlist without a database: the follower's request goes straight to the creator's WhatsApp
 * (or Instagram DMs), pre-written. Sign-ups land where Indian creators already talk to followers.
 */
export default function PublicStore({ store }: { store: Storefront }) {
  const [picked, setPicked] = useState<number | null>(null);
  const product = picked !== null ? store.products[picked] : null;
  const bookable = product ? BOOKABLE.includes(product.format) : false;
  const first = store.creator.displayName.split(" ")[0] || "the creator";
  const wa = store.creator.whatsapp;
  const message = product
    ? bookable
      ? `Hi ${first}! I saw your page and I'd like to request a slot for "${product.title}" (${formatInr(product.priceInr)}).`
      : `Hi ${first}! I saw your page and I'd like to join the waitlist for "${product.title}" (${formatInr(product.priceInr)}). Please let me know when it's ready.`
    : "";

  return (
    <>
      <StoreView store={store} mode="public" onCta={(i) => setPicked(i)} />
      <Sheet open={!!product} onClose={() => setPicked(null)} title={product?.title || ""}>
        {product && (
          <div className="pb-2">
            <p className="text-sm text-neutral-600">
              {bookable
                ? `${first} is opening a few slots. Send a quick message and they'll fix a time with you.`
                : `${first} is putting this together now. Join the waitlist to get it first at the early price.`}
            </p>
            <p className="mb-4 mt-3 font-display text-3xl font-extrabold">{product.priceInr > 0 ? formatInr(product.priceInr) : "Free"}</p>
            {wa ? (
              <a
                href={`https://wa.me/91${wa}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="press block w-full rounded-2xl bg-[#25D366] py-3.5 text-center text-sm font-extrabold text-white brut-sm"
              >
                {bookable ? "Request a slot on WhatsApp" : "Join the waitlist on WhatsApp"}
              </a>
            ) : store.creator.handle ? (
              <a
                href={`https://ig.me/m/${store.creator.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="press block w-full rounded-2xl bg-violet py-3.5 text-center text-sm font-extrabold text-white brut-sm"
              >
                {bookable ? "Request a slot by DM" : "Join the waitlist by DM"}
              </a>
            ) : (
              <p className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">Checkout opens soon. Check back here in a few days.</p>
            )}
            {(wa || store.creator.handle) && <p className="mt-2 text-center text-xs text-neutral-500">Opens a chat with a ready-to-send message. Nothing is shared until you send it.</p>}
          </div>
        )}
      </Sheet>
    </>
  );
}
