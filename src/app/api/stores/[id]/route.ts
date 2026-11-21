import { deleteStore, getRequests, getViews, putSaved } from "@/lib/db";
import { ownStore } from "@/lib/owner";
import { json, sanitizeDraft } from "@/lib/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const r = await ownStore((await params).id);
  if (r instanceof Response) return r;
  const { store, me } = r;
  const requests = await getRequests(store.id);
  const views = store.slug ? await getViews(store.slug) : 0;
  return json({ store, requests, views, instagram: me.instagram ? { handle: me.instagram.handle, status: me.instagram.status } : null });
}

/** Autosave the draft. */
export async function PUT(req: Request, { params }: Ctx) {
  const r = await ownStore((await params).id);
  if (r instanceof Response) return r;
  const { store, me } = r;
  const body = (await req.json().catch(() => ({}))) as { draft?: unknown; clearNotes?: boolean };
  const draft = sanitizeDraft(body.draft, store.draft);
  draft.creator.whatsapp = me.phone;
  store.draft = draft;
  if (body.clearNotes) store.notes = {};
  store.updatedAt = new Date().toISOString();
  await putSaved(store);
  return json({ ok: true, updatedAt: store.updatedAt });
}

/** Same as PUT: the editor's last-chance save on page close uses sendBeacon, which can only POST. */
export const POST = PUT;

/** Delete this store: draft, live page and its customer requests. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const r = await ownStore((await params).id);
  if (r instanceof Response) return r;
  await deleteStore(r.me, r.store.id);
  return json({ ok: true });
}
