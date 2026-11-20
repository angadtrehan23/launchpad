import { aiCooldownSecs, generateStore, regeneratePlan, regenerateProduct, regenerateProfile } from "@/lib/ai";
import { checkInput } from "@/lib/input";
import { aiRateLimit, json, sanitizeDraft } from "@/lib/server";
import type { Storefront } from "@/lib/types";

export const maxDuration = 60;

const FAIL = "The AI couldn't respond just now. Your store is unchanged — try again in a moment.";

/** If the free tier is cooling down, say for how long so the editor can retry by itself. */
function failed() {
  const retryAfter = aiCooldownSecs();
  return json({ error: retryAfter ? `AI is catching its breath. Trying again in ${retryAfter}s…` : FAIL, retryAfter }, 503);
}

/**
 * Regenerate the whole page or one part. Stateless: the browser sends its current draft and the
 * creator's original answers; we return the new draft. Non-destructive: on failure nothing changes.
 */
export async function POST(req: Request) {
  const limited = await aiRateLimit(req, "regen");
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { target?: string; hint?: string; draft?: unknown; input?: Record<string, unknown> };
  const check = checkInput(body.input || {}, true);
  if (!check.ok) return json({ error: "We lost your original answers. Build the store again from the start." }, 400);

  const target = String(body.target || "all");
  const hint = typeof body.hint === "string" ? body.hint.slice(0, 200).trim() : "";
  const fallback: Storefront = {
    creator: { displayName: "", handle: check.input.handle, tagline: "", bio: "", niche: "" },
    products: [],
    plan: [],
    theme: "candy",
    language: check.input.language,
  };
  const current = sanitizeDraft(body.draft, fallback);
  const input = { ...check.input, language: current.language };

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
      current.creator = { ...result.store.creator, handle: current.creator.handle, whatsapp: current.creator.whatsapp };
      current.products = result.store.products;
      current.plan = result.store.plan;
    }
  } catch (err) {
    console.error("[regenerate] failed", target, err instanceof Error ? err.message : err);
    return failed();
  }
  return json({ draft: current });
}
