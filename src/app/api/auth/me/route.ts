import { checkPassword, currentCreator, logout, publicAccount } from "@/lib/auth";
import { deleteCreator } from "@/lib/db";
import { json } from "@/lib/server";

export async function GET() {
  const me = await currentCreator();
  return me ? json({ account: publicAccount(me) }) : json({ account: null }, 401);
}

/** Delete my account, stores, live pages and customer requests. Needs the password again. */
export async function DELETE(req: Request) {
  const me = await currentCreator();
  if (!me) return json({ error: "Please log in again." }, 401);
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!(await checkPassword(String(password || ""), me.passHash))) return json({ error: "That password isn't right." }, 401);
  await deleteCreator(me);
  await logout("creator");
  return json({ ok: true });
}
