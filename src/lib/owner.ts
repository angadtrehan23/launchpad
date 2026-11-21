import { currentCreator } from "./auth";
import { getSaved } from "./db";
import { json } from "./server";
import type { CreatorAccount, SavedStore } from "./types";

export async function requireCreator(): Promise<CreatorAccount | Response> {
  const me = await currentCreator();
  return me ?? json({ error: "Please log in again.", code: "login" }, 401);
}

/** Load a store the logged-in creator owns. */
export async function ownStore(id: string): Promise<{ me: CreatorAccount; store: SavedStore } | Response> {
  const me = await requireCreator();
  if (me instanceof Response) return me;
  const store = await getSaved(id);
  if (!store || store.ownerId !== me.id) return json({ error: "We couldn't find this store in your account." }, 404);
  return { me, store };
}
