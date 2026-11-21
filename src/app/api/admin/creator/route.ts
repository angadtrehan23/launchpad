import { randomBytes } from "crypto";
import { hashPassword, isAdmin } from "@/lib/auth";
import { audit, deleteCreator, getCreator, saveCreator } from "@/lib/db";
import { json } from "@/lib/server";

/**
 * Admin actions on one creator:
 * - reset: forgot password. Makes a temporary password, shown once to the admin to pass on.
 * - delete: takedown of a fake, impersonating or spam account (stores, pages and requests go too).
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return json({ error: "Admin login needed." }, 401);
  const { creatorId, action } = (await req.json().catch(() => ({}))) as { creatorId?: string; action?: string };
  const c = await getCreator(String(creatorId || ""));
  if (!c) return json({ error: "Creator not found." }, 404);
  if (action === "reset") {
    const temp = randomBytes(6).toString("base64url");
    c.passHash = await hashPassword(temp);
    await saveCreator(c);
    await audit("password_reset", `${c.name} (…${c.phone.slice(-4)})`);
    return json({ ok: true, tempPassword: temp });
  }
  if (action === "delete") {
    await deleteCreator(c);
    await audit("creator_deleted", `${c.name} (…${c.phone.slice(-4)}), ${c.storeIds.length} store(s)`);
    return json({ ok: true });
  }
  return json({ error: "Unknown action." }, 400);
}
