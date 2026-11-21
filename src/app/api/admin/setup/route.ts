import { hashPassword, startAdminSession } from "@/lib/auth";
import { claimAdmin, durableStorage, getAdminHash } from "@/lib/db";
import { json } from "@/lib/server";

/** First visit only: whoever runs Launchpad sets the admin password. After that, this is closed. */
export async function GET() {
  return json({ setUp: !!(await getAdminHash()) });
}

export async function POST(req: Request) {
  if (!durableStorage) return json({ error: "Connect the database first." }, 503);
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (String(password || "").length < 10) return json({ error: "Use at least 10 characters for the admin password." }, 400);
  if (!(await claimAdmin(await hashPassword(String(password))))) return json({ error: "The admin password is already set. Log in instead." }, 409);
  await startAdminSession();
  return json({ ok: true });
}
