import { generateStore } from "@/lib/ai";
import { funnel } from "@/lib/db";
import { checkInput } from "@/lib/input";
import { aiRateLimit, json } from "@/lib/server";
import { THEMES, type Theme } from "@/lib/types";

export const maxDuration = 60;

/**
 * Step 5: build the store + launch plan for the chosen direction.
 * Stateless: the draft goes back to the creator's browser, which keeps it. No database needed.
 */
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

  // aiText: the reply the visitor's browser already got from the free AI (own quota, no shared cooldown).
  const aiText = typeof body.aiText === "string" && body.aiText.length < 40000 ? body.aiText : undefined;
  const result = await generateStore(check.input, { force, theme, prefetched: aiText });
  if (result.kind === "needs_more") {
    return json({ status: "needs_more", reason: "model", message: result.question, canForce: true });
  }
  await funnel("store_generated");
  console.log(`[funnel] generation_done source=${result.source} ms=${result.ms} audience=${check.input.audience}`);
  return json({
    status: "ok",
    draft: result.store,
    input: check.input,
    source: result.source,
    assumption: result.assumption,
    notice: result.notice,
    generationMs: result.ms,
  });
}
