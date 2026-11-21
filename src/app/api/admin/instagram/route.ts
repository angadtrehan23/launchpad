import { isAdmin } from "@/lib/auth";
import { audit, getCreator, saveCreator } from "@/lib/db";
import { json } from "@/lib/server";

/** Team confirms (or rejects) that the creator's Instagram bio shows their code. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return json({ error: "Admin login needed." }, 401);
  const { creatorId, status } = (await req.json().catch(() => ({}))) as { creatorId?: string; status?: string };
  if (status !== "verified" && status !== "rejected") return json({ error: "Bad status." }, 400);
  const c = await getCreator(String(creatorId || ""));
  if (!c?.instagram) return json({ error: "No Instagram check for this creator." }, 404);
  c.instagram = { ...c.instagram, status, reviewedAt: new Date().toISOString() };
  await saveCreator(c);
  await audit(`instagram_${status}`, `@${c.instagram.handle} for ${c.name}`);
  return json({ ok: true });
}
