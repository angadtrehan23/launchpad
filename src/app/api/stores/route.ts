import { checkInput } from "@/lib/input";
import { countRequests, getSavedMany, putSaved, saveCreator } from "@/lib/db";
import { requireCreator } from "@/lib/owner";
import { json, sanitizeDraft } from "@/lib/server";
import type { SavedStore } from "@/lib/types";

/** The creator's stores. */
export async function GET() {
  const me = await requireCreator();
  if (me instanceof Response) return me;
  const stores = (await getSavedMany(me.storeIds)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const reqs = await countRequests(stores.map((s) => s.id));
  return json({
    stores: stores.map((s) => ({ id: s.id, title: s.draft.products[0]?.title || "Untitled store", niche: s.input.niche, slug: s.slug, publishedAt: s.publishedAt, updatedAt: s.updatedAt, requests: reqs[s.id] || 0 })),
  });
}

/** Save a freshly generated store to the creator's account. */
export async function POST(req: Request) {
  const me = await requireCreator();
  if (me instanceof Response) return me;
  if (me.storeIds.length >= 20) return json({ error: "You have 20 stores already. Open one of them from My stores." }, 400);
  const body = (await req.json().catch(() => ({}))) as { input?: Record<string, unknown>; draft?: unknown; source?: string; notes?: { assumption?: string; notice?: string } };
  const check = checkInput({ ...(body.input || {}), whatsapp: me.phone }, true);
  if (!check.ok) return json({ error: "Your answers didn't come through. Please build the store again." }, 400);
  const input = check.input;
  const draft = sanitizeDraft(body.draft, { creator: { displayName: me.name, handle: input.handle, tagline: "", bio: "", niche: input.niche }, products: [], plan: [], theme: "candy", language: input.language });
  draft.creator.whatsapp = me.phone;
  if (!draft.products.length) return json({ error: "This store has no products yet. Please build it again." }, 400);
  const now = new Date().toISOString();
  const store: SavedStore = {
    id: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
    ownerId: me.id,
    input,
    draft,
    source: body.source === "starter" ? "starter" : "ai",
    notes: { assumption: String(body.notes?.assumption || "").slice(0, 300) || undefined, notice: String(body.notes?.notice || "").slice(0, 300) || undefined },
    slug: null,
    published: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await putSaved(store);
  me.storeIds = [store.id, ...me.storeIds];
  await saveCreator(me);
  return json({ id: store.id });
}
