import { cleanPhone, hashPassword, PASSWORD_MIN, phoneValid, publicAccount, startCreatorSession } from "@/lib/auth";
import { claimPhone, durableStorage, funnel, saveCreator, underLimit } from "@/lib/db";
import { clientIp, json } from "@/lib/server";
import type { CreatorAccount } from "@/lib/types";

/** Create a creator account: name, mobile number, password. */
export async function POST(req: Request) {
  if (!durableStorage) return json({ error: "Sign-ups are paused while we connect our database. Please try again shortly." }, 503);
  const body = (await req.json().catch(() => ({}))) as { name?: string; phone?: string; password?: string };
  const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 40);
  const phone = cleanPhone(body.phone);
  const password = String(body.password || "");
  if (name.length < 2) return json({ error: "Please enter your full name." }, 400);
  if (!phoneValid(phone)) return json({ error: "Enter a 10-digit Indian mobile number." }, 400);
  if (password.length < PASSWORD_MIN) return json({ error: `Use at least ${PASSWORD_MIN} characters for your password.` }, 400);
  if (!(await underLimit(`signup:${clientIp(req)}`, 10, 3600))) return json({ error: "Too many sign-ups from this network. Try again in an hour." }, 429);

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  if (!(await claimPhone(phone, id))) return json({ error: "This number already has an account. Log in instead.", code: "exists" }, 409);
  const now = new Date().toISOString();
  const account: CreatorAccount = { id, name, phone, passHash: await hashPassword(password), createdAt: now, lastLoginAt: now, instagram: null, storeIds: [] };
  await saveCreator(account);
  await startCreatorSession(id);
  await funnel("signed_up");
  return json({ account: publicAccount(account) });
}
