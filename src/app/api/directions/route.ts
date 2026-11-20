import { generateDirections } from "@/lib/ai";
import { funnel } from "@/lib/db";
import { checkInput } from "@/lib/input";
import { aiRateLimit, json } from "@/lib/server";

export const maxDuration = 60;

/** Step 4: "We'll figure it out for you" — three sellable directions from taps and keywords. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ status: "error", message: "Something went wrong sending your details. Please try again." }, 400);

  const force = body.force === true;
  const check = checkInput({ ...body, direction: null }, force);
  if (!check.ok) {
    return json({ status: "needs_more", reason: check.reason, message: check.message, canForce: check.reason === "thin" });
  }
  const limited = await aiRateLimit(req, "generate");
  if (limited) return limited;

  const avoid = Array.isArray(body.avoid) ? body.avoid.filter((x): x is string => typeof x === "string").slice(0, 9) : [];
  const result = await generateDirections(check.input, avoid);
  if (result.kind === "needs_more") {
    return json({ status: "needs_more", reason: "model", message: result.question, canForce: false });
  }
  await funnel("directions_shown");
  return json({ status: "ok", directions: result.directions, source: result.source, audience: check.input.audience });
}
