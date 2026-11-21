import { RISKY } from "@/lib/ai";
import { funnel, putSaved } from "@/lib/db";
import { ownStore } from "@/lib/owner";
import { json, makeSlug, sanitizeDraft } from "@/lib/server";
import { publicText } from "@/lib/share";

type Ctx = { params: Promise<{ id: string }> };

/** Check the draft and make it the live version at /s/<slug>. */
export async function POST(req: Request, { params }: Ctx) {
  if (process.env.PUBLISH_PAUSED === "true") return json({ error: "Publishing is paused for maintenance. Your draft is safe, so try again soon." }, 503);
  const r = await ownStore((await params).id);
  if (r instanceof Response) return r;
  const { store, me } = r;
  const body = (await req.json().catch(() => ({}))) as { draft?: unknown };
  const draft = sanitizeDraft(body.draft ?? store.draft, store.draft);
  draft.products = draft.products.filter((p) => p.title.trim());
  if (!draft.creator.displayName.trim() || draft.products.length === 0) return json({ error: "Add your name and at least one product before publishing." }, 400);
  // Same honesty rule for what the creator typed as for what the AI wrote: this page is public.
  const risky = publicText(draft).match(RISKY);
  if (risky) return json({ error: `Your page says “${risky[0]}”. We can't publish guaranteed results, cures or income promises. Reword it and publish again.` }, 400);

  const first = !store.slug;
  if (!store.slug) store.slug = await makeSlug(draft.creator.displayName || me.name, store.id);
  draft.creator.whatsapp = me.phone;
  store.draft = draft;
  // The public copy leaves out the creator-only parts: plan, private number.
  store.published = { ...structuredClone(draft), plan: [], creator: { ...draft.creator, whatsapp: "" } };
  store.publishedAt = new Date().toISOString();
  store.updatedAt = store.publishedAt;
  await putSaved(store);
  if (first) await funnel("published");
  return json({ slug: store.slug, publishedAt: store.publishedAt });
}
