import { RISKY } from "@/lib/ai";
import { funnel } from "@/lib/db";
import { checkInput } from "@/lib/input";
import { json, sanitizeDraft } from "@/lib/server";
import { encodeStore, publicText } from "@/lib/share";
import type { Storefront } from "@/lib/types";

/** Check the draft and turn it into a shareable link. Nothing is stored on the server. */
export async function POST(req: Request) {
  if (process.env.PUBLISH_PAUSED === "true") {
    return json({ error: "Publishing is paused for maintenance. Your draft is safe — try again soon." }, 503);
  }
  const body = (await req.json().catch(() => ({}))) as { draft?: unknown; input?: Record<string, unknown>; first?: boolean };
  const check = checkInput(body.input || {}, true);
  const handle = check.ok ? check.input.handle : "";
  const fallback: Storefront = { creator: { displayName: "", handle, tagline: "", bio: "", niche: "" }, products: [], plan: [], theme: "candy", language: "english" };
  const draft = sanitizeDraft(body.draft, fallback);

  draft.products = draft.products.filter((p) => p.title.trim());
  if (!draft.creator.displayName.trim() || draft.products.length === 0) {
    return json({ error: "Add your name and at least one product before publishing." }, 400);
  }
  // Same honesty rule for what the creator typed as for what the AI wrote: this page is public.
  const risky = publicText(draft).match(RISKY);
  if (risky) {
    return json({ error: `Your page says “${risky[0]}”. We can't publish guaranteed results, cures or income promises. Reword it and publish again.` }, 400);
  }
  if (body.first === true) await funnel("published");
  const publicDraft: Storefront = { ...draft, plan: [] }; // the launch plan stays private
  return json({ path: `/s/${encodeStore(publicDraft)}` });
}
