import { getRequests, removeRequest } from "@/lib/db";
import { ownStore } from "@/lib/owner";
import { json } from "@/lib/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await ownStore((await params).id);
  if (r instanceof Response) return r;
  return json({ requests: (await getRequests(r.store.id)).reverse() });
}

/** Remove one request, e.g. when the customer asks to be taken off the list. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await ownStore((await params).id);
  if (r instanceof Response) return r;
  const body = (await req.json().catch(() => ({}))) as { at?: string; phone?: string };
  const ok = await removeRequest(r.store.id, { at: String(body.at || ""), phone: String(body.phone || "") });
  return ok ? json({ ok: true }) : json({ error: "That request was already removed." }, 404);
}
