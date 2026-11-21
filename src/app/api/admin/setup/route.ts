import { hashPassword, startAdminSession } from "@/lib/auth";
import { adminSetupCode, audit, claimAdmin, clearSetupCode, durableStorage, getAdminHash, underLimit } from "@/lib/db";
import { clientIp, json } from "@/lib/server";

/**
 * First visit only: whoever runs Launchpad sets the admin password.
 * It needs a one-time setup code that is written only to the server logs (Vercel → Logs),
 * so a stranger who finds /admin first can't claim it.
 */
export async function GET() {
  const setUp = !!(await getAdminHash());
  if (!setUp && durableStorage) await adminSetupCode();
  return json({ setUp });
}

export async function POST(req: Request) {
  if (!durableStorage) return json({ error: "Connect the database first." }, 503);
  if (!(await underLimit(`admin-setup:${clientIp(req)}`, 10, 900))) return json({ error: "Too many tries. Wait 15 minutes." }, 429);
  const { password, code } = (await req.json().catch(() => ({}))) as { password?: string; code?: string };
  if (await getAdminHash()) return json({ error: "The admin password is already set. Log in instead." }, 409);
  if (String(code || "").trim() !== (await adminSetupCode())) return json({ error: "That setup code isn't right. Check Vercel → Logs for the latest one." }, 401);
  const pw = String(password || "");
  if (pw.length < 10 || pw.length > 200) return json({ error: "Use 10 to 200 characters for the admin password." }, 400);
  if (!(await claimAdmin(await hashPassword(pw)))) return json({ error: "The admin password is already set. Log in instead." }, 409);
  await clearSetupCode();
  await audit("admin_setup", "admin password set");
  await startAdminSession();
  return json({ ok: true });
}
