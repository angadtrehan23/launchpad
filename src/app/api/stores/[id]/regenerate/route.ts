import { aiCooldownSecs, generateStore, regeneratePlan, regenerateProduct, regenerateProfile } from "@/lib/ai";
import { saveStore } from "@/lib/db";
import { aiRateLimit, json, loadAuthed, sanitizeDraft } from "@/lib/server";

export const maxDuration = 60;

const FAIL = "The AI couldn't respond just now. Your store is unchanged — try again in a moment.";

/** If the free tier is cooling down, say for how long so the editor can retry by itself. */
function failed() {
  const retryAfter = aiCooldownSecs();
  return json({ error: retryAfter ? `AI is catching its breath. Trying again in ${retryAfter}s…` : FAIL, retryAfter }, 503);
}

/**
 * Regenerate the whole page or one part. Non-destructive: if the model fails,
 * the creator's current content is untouched and they get a friendly error.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await loadAuthed(req, id);
  if (rec instanceof Response) return rec;
  const limited = await aiRateLimit(req, "regen");
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { target?: string; hint?: string; draft?: unknown };
  const target = String(body.target || "all");
  const hint = typeof body.hint === "string" ? body.hint.slice(0, 200).trim() : "";
  const current = sanitizeDraft(body.draft, rec.draft); // the creator's latest edits, even if not autosaved yet
  const input = { ...rec.input, language: current.language };

  try {
    if (target === "profile") {
      current.creator = { ...current.creator, ...(await regenerateProfile(input, current, hint)) };
    } else if (target === "plan") {
      current.plan = await regeneratePlan(input, current, hint);
    } else if (target === "product:new") {
      if (current.products.length >= 4) return json({ error: "Four products is plenty for a new store — replace one instead." }, 400);
      current.products.push(await regenerateProduct(input, current, current.products.length, hint));
    } else if (target.startsWith("product:")) {
      const index = Number(target.split(":")[1]);
      if (!Number.isInteger(index) || index < 0 || index >= current.products.length) {
        return json({ error: "That product no longer exists. Refresh and try again." }, 400);
      }
      current.products[index] = await regenerateProduct(input, current, index, hint);
    } else {
      // Keep what the creator corrected (name, niche, bio) as facts for the new version.
      const result = await generateStore(input, {
        force: true,
        hint,
        theme: current.theme,
        avoidTitles: current.products.map((p) => p.title),
        confirmed: current.creator,
      });
      if (result.kind !== "ok" || result.source !== "ai") return failed();
      current.creator = { ...result.store.creator, handle: current.creator.handle };
      current.products = result.store.products;
      current.plan = result.store.plan;
      rec.source = "ai";
    }
  } catch (err) {
    console.error("[regenerate] failed", target, err instanceof Error ? err.message : err);
    return failed();
  }

  rec.draft = current;
  rec.updatedAt = new Date().toISOString();
  if (rec.metrics) {
    const key = target.startsWith("product:") ? "product" : target;
    rec.metrics.regens[key] = (rec.metrics.regens[key] || 0) + 1;
  }
  await saveStore(rec);
  return json({ draft: rec.draft });
}
