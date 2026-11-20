import { funnel, track } from "@/lib/db";

/** Fire-and-forget analytics for the public page. Never fails loudly. */
export async function POST(req: Request) {
  try {
    const { slug, kind, index, event } = await req.json();
    if (kind === "funnel" && event === "wizard_started") await funnel("wizard_started");
    if (typeof slug === "string" && /^[a-z0-9-]{1,40}$/.test(slug) && (kind === "view" || kind === "click")) {
      await track(slug, kind, Math.max(0, Math.min(9, Number(index) || 0)));
    }
  } catch (err) {
    console.error("[track]", err);
  }
  return new Response(null, { status: 204 });
}
