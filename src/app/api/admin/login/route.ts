import { checkPassword, startAdminSession } from "@/lib/auth";
import { getAdminHash, underLimit } from "@/lib/db";
import { clientIp, json } from "@/lib/server";

export async function POST(req: Request) {
  if (!(await underLimit(`admin-login:${clientIp(req)}`, 10, 900))) return json({ error: "Too many tries. Wait 15 minutes." }, 429);
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  const hash = await getAdminHash();
  if (!hash || !(await checkPassword(String(password || ""), hash))) return json({ error: "Wrong admin password." }, 401);
  await startAdminSession();
  return json({ ok: true });
}
