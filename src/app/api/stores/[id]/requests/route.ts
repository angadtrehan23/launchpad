import { getRequests } from "@/lib/db";
import { ownStore } from "@/lib/owner";
import { json } from "@/lib/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await ownStore((await params).id);
  if (r instanceof Response) return r;
  return json({ requests: (await getRequests(r.store.id)).reverse() });
}
