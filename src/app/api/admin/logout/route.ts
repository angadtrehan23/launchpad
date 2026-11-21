import { logout } from "@/lib/auth";
import { json } from "@/lib/server";

export async function POST() {
  await logout("admin");
  return json({ ok: true });
}
