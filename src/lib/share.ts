import { deflateRawSync, inflateRawSync } from "zlib";
import { RISKY } from "./ai";
import { sanitizeDraft } from "./server";
import type { Storefront } from "./types";

/**
 * No database: a published store lives inside its own link.
 * The checked draft is compressed and base64url-encoded into /s/<code>.
 * Typical store ≈ 1–2 KB of link, fine for WhatsApp and Instagram bios.
 */
const VERSION = "1";

export function encodeStore(store: Storefront): string {
  return VERSION + deflateRawSync(Buffer.from(JSON.stringify(store)), { level: 9 }).toString("base64url");
}

const EMPTY: Storefront = {
  creator: { displayName: "", handle: "", tagline: "", bio: "", niche: "" },
  products: [],
  plan: [],
  theme: "candy",
  language: "english",
};

/** Decode and re-check a link. Returns null for anything malformed or that fails the honesty rule. */
export function decodeStore(code: string): Storefront | null {
  try {
    if (!code.startsWith(VERSION) || code.length > 12000) return null;
    const raw = JSON.parse(inflateRawSync(Buffer.from(code.slice(1), "base64url")).toString("utf8"));
    const handle = typeof raw?.creator?.handle === "string" && /^[a-zA-Z0-9._]{1,30}$/.test(raw.creator.handle) ? raw.creator.handle : "";
    const store = sanitizeDraft(raw, { ...EMPTY, creator: { ...EMPTY.creator, handle } });
    store.products = store.products.filter((p) => p.title.trim());
    if (!store.creator.displayName.trim() || !store.products.length) return null;
    if (RISKY.test(publicText(store))) return null; // links can be hand-made, so check again on render
    store.plan = []; // the launch plan is creator-only; never shown publicly
    return store;
  } catch {
    return null;
  }
}

export function publicText(store: Storefront): string {
  return [store.creator.tagline, store.creator.bio, ...store.products.flatMap((p) => [p.title, p.description, ...p.highlights])].join(" ");
}
