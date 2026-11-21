import { cleanPhone, phoneValid } from "@/lib/auth";
import { addRequest, funnel, getSaved, storeIdBySlug, underLimit } from "@/lib/db";
import { clientIp, json } from "@/lib/server";
import { ctaOf } from "@/lib/types";

/** A customer taps a product button and leaves their details. Saved to the creator's account. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { slug?: string; index?: number; name?: string; phone?: string; message?: string; consent?: boolean };
  const name = String(body.name || "").trim().slice(0, 60);
  const phone = cleanPhone(body.phone);
  if (name.length < 2) return json({ error: "Please enter your name." }, 400);
  if (!phoneValid(phone)) return json({ error: "Please enter a 10-digit Indian mobile number." }, 400);
  if (body.consent !== true) return json({ error: "Please tick the box so the creator can contact you." }, 400);
  if (!(await underLimit(`request:${clientIp(req)}`, 20, 3600))) return json({ error: "Too many requests from this network. Try again later." }, 429);

  const id = await storeIdBySlug(String(body.slug || "").slice(0, 60));
  const store = id ? await getSaved(id) : null;
  const product = store?.published?.products[Number(body.index)];
  if (!store || !product) return json({ error: "This product isn't available any more." }, 404);
  const cta = ctaOf(product);
  const result = await addRequest(store.id, {
    index: Number(body.index),
    product: product.title,
    action: cta.action,
    name,
    phone,
    message: cta.action === "question" ? String(body.message || "").trim().slice(0, 300) : undefined,
    at: new Date().toISOString(),
  });
  if (result === "full") return json({ error: "This list is full right now. Please try again later." }, 400);
  if (result === "added") await funnel("waitlist_join");
  return json({ ok: true, duplicate: result === "duplicate" });
}
