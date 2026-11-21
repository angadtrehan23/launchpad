import { publicAccount } from "@/lib/auth";
import { saveCreator } from "@/lib/db";
import { cleanHandle, isValidInstagramHandle } from "@/lib/input";
import { requireCreator } from "@/lib/owner";
import { json } from "@/lib/server";

/**
 * Start (or restart) Instagram ownership verification.
 * Instagram doesn't let apps read profiles without its official login, so the creator adds a
 * one-time code to their bio and the Launchpad team confirms it from the admin page.
 */
export async function POST(req: Request) {
  const me = await requireCreator();
  if (me instanceof Response) return me;
  const body = (await req.json().catch(() => ({}))) as { handle?: string };
  const handle = cleanHandle(String(body.handle || ""));
  if (!isValidInstagramHandle(handle)) return json({ error: "That doesn't look like an Instagram username. Use letters, numbers, dots or underscores." }, 400);
  const same = me.instagram && me.instagram.handle === handle && me.instagram.status !== "rejected";
  if (!same) {
    me.instagram = { handle, code: `LP-${Math.floor(1000 + Math.random() * 9000)}`, status: "pending", requestedAt: new Date().toISOString() };
    await saveCreator(me);
  }
  return json({ account: publicAccount(me) });
}
