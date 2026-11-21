import { currentCreator, publicAccount } from "@/lib/auth";
import { json } from "@/lib/server";

export async function GET() {
  const me = await currentCreator();
  return me ? json({ account: publicAccount(me) }) : json({ account: null }, 401);
}
