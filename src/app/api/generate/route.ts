import { generateStore } from "@/lib/ai";
import { funnel, saveStore } from "@/lib/db";
import { checkInput } from "@/lib/input";
import { aiRateLimit, json, makeSlug } from "@/lib/server";
import { THEMES, type StoreRecord, type Theme } from "@/lib/types";

export const maxDuration = 60;

/** Step 5: build the store + launch plan for the chosen direction. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ status: "error", message: "Something went wrong sending your details. Please try again." }, 400);

  const force = body.force === true;
  const theme: Theme = THEMES.includes(body.theme as Theme) ? (body.theme as Theme) : "candy";
  const check = checkInput(body, force);
  if (!check.ok) {
    return json({ status: "needs_more", reason: check.reason, message: check.message, canForce: check.reason === "thin" });
  }
  const limited = await aiRateLimit(req, "generate");
  if (limited) return limited;

  const aiText = typeof body.aiText === "string" && body.aiText.length < 40000 ? body.aiText : undefined;
  const result = await generateStore(check.input, { force, theme, prefetched: aiText });
  if (result.kind === "needs_more") {
    return json({ status: "needs_more", reason: "model", message: result.question, canForce: true });
  }

  const now = new Date().toISOString();
  const started = typeof body.sessionStartedAt === "string" && !Number.isNaN(Date.parse(body.sessionStartedAt)) ? body.sessionStartedAt : null;
  const rec: StoreRecord = {
    id: crypto.randomUUID(),
    editToken: crypto.randomUUID(),
    slug: await makeSlug(check.input.handle || result.store.creator.displayName),
    input: check.input,
    draft: result.store,
    published: null,
    source: result.source,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    metrics: {
      sessionStartedAt: started,
      generatedAt: now,
      generationMs: result.ms,
      directionsShown: Math.max(0, Math.min(30, Number(body.directionsShown) || 0)),
      edits: {},
      regens: {},
    },
  };
  try {
    await saveStore(rec);
  } catch (err) {
    console.error("[generate] save failed", err);
    return json({ status: "error", message: "We built your store but couldn't save it. Please try again." }, 503);
  }
  await funnel("store_generated");
  console.log(`[funnel] generation_done source=${result.source} ms=${result.ms} audience=${check.input.audience}`);
  return json({ status: "ok", id: rec.id, editToken: rec.editToken, source: result.source, assumption: result.assumption, notice: result.notice });
}
