import { hashPassword, startAdminSession } from "@/lib/auth";
import { adminSetupCode, audit, claimAdmin, clearSetupCode, durableStorage, getAdminHash, resetAdmin, underLimit } from "@/lib/db";
import { clientIp, json } from "@/lib/server";

/**
 * Claiming (first time) or resetting the admin password needs a one-time setup code that is written
 * only to the server logs (Vercel → Logs), so only the project owner can do it.
 * GET ?reset=1 writes a fresh code to the logs even when a password is already set.
 */
export async function GET(req: Request) {
  const setUp = !!(await getAdminHash());
  const reset = new URL(req.url).searchParams.get("reset") === "1";
  if ((!setUp || reset) && durableStorage && (await underLimit(`admin-code:${clientIp(req)}`, 10, 900))) await adminSetupCode();
  return json({ setUp });
}

export async function POST(req: Request) {
  if (!durableStorage) return json({ error: "Connect the database first." }, 503);
  if (!(await underLimit(`admin-setup:${clientIp(req)}`, 10, 900))) return json({ error: "Too many tries. Wait 15 minutes." }, 429);
  const { password, code, reset } = (await req.json().catch(() => ({}))) as { password?: string; code?: string; reset?: boolean };
  const setUp = !!(await getAdminHash());
  if (setUp && reset !== true) return json({ error: "The admin password is already set. Log in instead." }, 409);
  if (!/^\d{8}$/.test(String(code || "").trim()) || String(code).trim() !== (await adminSetupCode())) {
    return json({ error: "That setup code isn't right. Check Vercel → Logs for the latest one." }, 401);
  }
  const pw = String(password || "");
  if (pw.length < 10 || pw.length > 200) return json({ error: "Use 10 to 200 characters for the admin password." }, 400);
  const hash = await hashPassword(pw);
  if (setUp) await resetAdmin(hash);
  else if (!(await claimAdmin(hash))) return json({ error: "The admin password is already set. Log in instead." }, 409);
  await clearSetupCode();
  await audit(setUp ? "admin_reset" : "admin_setup", setUp ? "admin password reset by owner; old admin sessions signed out" : "admin password set");
  await startAdminSession();
  return json({ ok: true });
}
