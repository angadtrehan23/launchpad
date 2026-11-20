import { addToWaitlist, funnel, getStoreBySlug, underLimit } from "@/lib/db";
import { clientIp, json } from "@/lib/server";

/** A follower joins the waitlist for a product (or requests a 1:1 / workshop slot). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const index = Number(body?.index);
  const name = typeof body?.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const phoneDigits = typeof body?.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  const phone = phoneDigits.length === 12 && phoneDigits.startsWith("91") ? phoneDigits.slice(2) : phoneDigits;

  if (!/^[a-z0-9-]{1,40}$/.test(slug) || !Number.isInteger(index) || index < 0 || index > 9) {
    return json({ error: "Something went wrong. Please refresh and try again." }, 400);
  }
  if (!name) return json({ error: "Please add your name." }, 400);
  if (!/^[6-9]\d{9}$/.test(phone)) return json({ error: "Please enter a 10-digit Indian mobile number." }, 400);
  if (body?.consent !== true) return json({ error: "Please tick the box so the creator can message you." }, 400);

  try {
    if (!(await underLimit(`waitlist:${clientIp(req)}`, 20, 3600))) {
      return json({ error: "Too many sign-ups from this connection. Try again later." }, 429);
    }
  } catch {}

  const rec = await getStoreBySlug(slug);
  if (!rec?.published || index >= rec.published.products.length) {
    return json({ error: "This product isn't available anymore." }, 404);
  }
  const result = await addToWaitlist(rec.id, { index, name, phone, at: new Date().toISOString() });
  if (result === "full") return json({ error: "This waitlist is full right now." }, 409);
  if (result === "added") await funnel("waitlist_join");
  return json({ ok: true, duplicate: result === "duplicate" });
}
