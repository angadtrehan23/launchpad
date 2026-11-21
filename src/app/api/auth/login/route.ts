import { checkPassword, cleanPhone, publicAccount, startCreatorSession } from "@/lib/auth";
import { creatorIdByPhone, getCreator, saveCreator, underLimit } from "@/lib/db";
import { clientIp, json } from "@/lib/server";

const WRONG = "That number and password don't match. Check both and try again.";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: string; password?: string };
  const phone = cleanPhone(body.phone);
  const password = String(body.password || "").slice(0, 200);
  // Slow down password guessing: per number and per network.
  if (!(await underLimit(`login:${phone}`, 10, 900)) || !(await underLimit(`login-ip:${clientIp(req)}`, 30, 900))) {
    return json({ error: "Too many tries. Wait 15 minutes and try again." }, 429);
  }
  const id = await creatorIdByPhone(phone);
  const account = id ? await getCreator(id) : null;
  if (!account || !(await checkPassword(password, account.passHash))) return json({ error: WRONG }, 401);
  account.lastLoginAt = new Date().toISOString();
  await saveCreator(account);
  await startCreatorSession(account.id);
  return json({ account: publicAccount(account) });
}
