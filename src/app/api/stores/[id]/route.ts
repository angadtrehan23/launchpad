import { getStats, getWaitlist, saveStore } from "@/lib/db";
import { json, loadAuthed, publicRecord, sanitizeDraft } from "@/lib/server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await loadAuthed(req, id);
  if (rec instanceof Response) return rec;
  const waitlist = await getWaitlist(rec.id);
  const count = (rec.published || rec.draft).products.length;
  const stats = rec.published ? await getStats(rec.slug, count, waitlist) : { views: 0, clicks: [], waitlist: [] };
  return json({ record: publicRecord(rec), stats, waitlist });
}

/** Autosave of creator edits. `field` feeds the edit-depth diagnostic (which AI fields creators change). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await loadAuthed(req, id);
  if (rec instanceof Response) return rec;
  const body = await req.json().catch(() => null);
  rec.draft = sanitizeDraft(body?.draft, rec.draft);
  const fields: string[] = Array.isArray(body?.fields) ? body.fields.filter((f: unknown) => typeof f === "string").slice(0, 10) : [];
  if (rec.metrics) for (const f of fields) rec.metrics.edits[f.slice(0, 30)] = (rec.metrics.edits[f.slice(0, 30)] || 0) + 1;
  rec.updatedAt = new Date().toISOString();
  await saveStore(rec);
  return json({ ok: true, updatedAt: rec.updatedAt });
}
