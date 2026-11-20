import { RISKY } from "@/lib/ai";
import { durableStorage, funnel, saveStore } from "@/lib/db";
import { json, loadAuthed, sanitizeDraft } from "@/lib/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await loadAuthed(req, id);
  if (rec instanceof Response) return rec;
  if (process.env.PUBLISH_PAUSED === "true") {
    return json({ error: "Publishing is paused for maintenance. Your draft is safe — try again soon." }, 503);
  }
  if (!durableStorage) {
    return json({ error: "Publishing is paused while we connect storage. Your draft is safe — try again shortly." }, 503);
  }
  const body = await req.json().catch(() => ({}));
  const draft = sanitizeDraft(body?.draft, rec.draft);

  const products = draft.products.filter((p) => p.title.trim());
  if (!draft.creator.displayName.trim() || products.length === 0) {
    return json({ error: "Add your name and at least one product before publishing." }, 400);
  }
  // Same honesty rule for what the creator typed as for what the AI wrote: this page is public.
  const publicText = [draft.creator.tagline, draft.creator.bio, ...products.flatMap((p) => [p.title, p.description, ...p.highlights])].join(" ");
  const risky = publicText.match(RISKY);
  if (risky) {
    return json(
      { error: `Your page says “${risky[0]}”. We can't publish guaranteed results, cures or income promises. Reword it and publish again.` },
      400,
    );
  }
  const wasPublished = !!rec.published;
  draft.products = products;
  rec.draft = draft;
  rec.published = structuredClone(draft);
  rec.publishedAt = new Date().toISOString();
  rec.updatedAt = rec.publishedAt;
  await saveStore(rec);
  if (!wasPublished) await funnel("published");
  const m = rec.metrics;
  if (m?.sessionStartedAt) {
    const secs = Math.round((Date.parse(rec.publishedAt) - Date.parse(m.sessionStartedAt)) / 1000);
    const edits = Object.values(m.edits).reduce((a, b) => a + b, 0);
    console.log(`[funnel] published secs_since_start=${secs} edits=${edits} regens=${JSON.stringify(m.regens)} source=${rec.source}`);
  }
  return json({ slug: rec.slug, publishedAt: rec.publishedAt });
}
