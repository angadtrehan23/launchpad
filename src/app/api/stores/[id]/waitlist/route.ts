import { removeFromWaitlist } from "@/lib/db";
import { json, loadAuthed } from "@/lib/server";

/** Creator deletes a sign-up (a follower's right to have their number removed). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await loadAuthed(req, id);
  if (rec instanceof Response) return rec;
  const body = (await req.json().catch(() => ({}))) as { index?: number; phone?: string };
  const ok = await removeFromWaitlist(rec.id, Number(body.index), String(body.phone || ""));
  return ok ? json({ ok: true }) : json({ error: "That sign-up was already removed." }, 404);
}
