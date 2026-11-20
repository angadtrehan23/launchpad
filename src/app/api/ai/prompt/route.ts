import { aiConfig, directionsMessages, storeMessages } from "@/lib/ai";
import { checkInput } from "@/lib/input";
import { json } from "@/lib/server";

/**
 * With the free keyless AI, the visitor's browser makes the AI call itself, so each visitor
 * uses their own free quota instead of queueing behind every other site on Vercel's shared IPs.
 * The server still builds the prompt here and checks the reply in /api/directions and /api/generate.
 * With a paid/keyed provider configured, mode is "server" and the browser skips this.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ mode: "server" });
  if (aiConfig.provider !== "openai_compat" || process.env.LLM_API_KEY || process.env.AI_DISABLED === "true") {
    return json({ mode: "server" });
  }
  const stage = body.stage === "store" ? "store" : "directions";
  const check = checkInput(stage === "directions" ? { ...body, direction: null } : body, body.force === true);
  if (!check.ok) return json({ mode: "server" }); // let the normal route return its friendly message
  const avoid = Array.isArray(body.avoid) ? body.avoid.filter((x): x is string => typeof x === "string").slice(0, 9) : [];
  const messages = stage === "store" ? storeMessages(check.input, { force: body.force === true }) : directionsMessages(check.input, avoid);
  return json({ mode: "browser", url: process.env.LLM_BASE_URL || "https://text.pollinations.ai/openai", model: process.env.LLM_MODEL || "openai", messages });
}
