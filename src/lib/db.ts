import { promises as fs } from "fs";
import path from "path";
import type { StoreRecord, StoreStats, WaitlistEntry } from "./types";

/**
 * Tiny key-value layer.
 * - Production: Upstash Redis over its REST API (added from the Vercel Marketplace,
 *   which sets KV_REST_API_URL / KV_REST_API_TOKEN or UPSTASH_REDIS_REST_*).
 * - Local dev: a JSON file in .data/ so the app runs with zero setup.
 */
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = Boolean(REDIS_URL && REDIS_TOKEN);

async function redis<T = unknown>(command: (string | number)[]): Promise<T> {
  const res = await fetch(REDIS_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis ${command[0]} failed: ${res.status}`);
  const json = (await res.json()) as { result: T; error?: string };
  if (json.error) throw new Error(json.error);
  return json.result;
}

// ---- file fallback (dev only) ----
const FILE = path.join(process.env.VERCEL ? "/tmp" : process.cwd(), ".data", "db.json");
type FileDb = Record<string, string>;
async function readFile(): Promise<FileDb> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as FileDb;
  } catch {
    return {};
  }
}
async function writeFile(db: FileDb) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(db));
}

async function get(key: string): Promise<string | null> {
  if (useRedis) return redis<string | null>(["GET", key]);
  return (await readFile())[key] ?? null;
}
async function set(key: string, value: string): Promise<void> {
  if (useRedis) {
    await redis(["SET", key, value]);
    return;
  }
  const db = await readFile();
  db[key] = value;
  await writeFile(db);
}
async function incr(key: string): Promise<void> {
  if (useRedis) {
    await redis(["INCR", key]);
    return;
  }
  const db = await readFile();
  db[key] = String(Number(db[key] || 0) + 1);
  await writeFile(db);
}

// ---- domain helpers ----
export async function saveStore(rec: StoreRecord): Promise<void> {
  await set(`store:${rec.id}`, JSON.stringify(rec));
  await set(`slug:${rec.slug}`, rec.id);
}

export async function getStore(id: string): Promise<StoreRecord | null> {
  const raw = await get(`store:${id}`);
  return raw ? (JSON.parse(raw) as StoreRecord) : null;
}

export async function getStoreBySlug(slug: string): Promise<StoreRecord | null> {
  const id = await get(`slug:${slug}`);
  return id ? getStore(id) : null;
}

export async function slugTaken(slug: string): Promise<boolean> {
  return (await get(`slug:${slug}`)) !== null;
}

export async function track(slug: string, kind: "view" | "click", index = 0): Promise<void> {
  await incr(kind === "view" ? `views:${slug}` : `clicks:${slug}:${index}`);
}

export async function getStats(slug: string, productCount: number, waitlist: WaitlistEntry[] = []): Promise<StoreStats> {
  const views = Number((await get(`views:${slug}`)) || 0);
  const clicks: number[] = [];
  const joins: number[] = [];
  for (let i = 0; i < productCount; i++) {
    clicks.push(Number((await get(`clicks:${slug}:${i}`)) || 0));
    joins.push(waitlist.filter((w) => w.index === i).length);
  }
  return { views, clicks, waitlist: joins };
}

// ---- waitlist (personal data: only ever read with the edit token) ----
// In Redis each sign-up is one list item (RPUSH is atomic), so two people joining at the same
// moment can't overwrite each other. The file store (dev only) keeps a JSON array.
const wlKey = (id: string) => `wl:${id}`;

async function rawWaitlist(id: string): Promise<string[]> {
  if (useRedis) return (await redis<string[]>(["LRANGE", wlKey(id), 0, -1])) || [];
  const raw = await get(wlKey(id));
  return raw ? (JSON.parse(raw) as WaitlistEntry[]).map((e) => JSON.stringify(e)) : [];
}

export async function getWaitlist(id: string): Promise<WaitlistEntry[]> {
  return (await rawWaitlist(id)).map((r) => JSON.parse(r) as WaitlistEntry);
}

export async function addToWaitlist(id: string, entry: WaitlistEntry): Promise<"added" | "duplicate" | "full"> {
  const list = await getWaitlist(id);
  if (list.length >= 2000) return "full";
  if (list.some((w) => w.phone === entry.phone && w.index === entry.index)) return "duplicate";
  if (useRedis) {
    await redis(["RPUSH", wlKey(id), JSON.stringify(entry)]);
  } else {
    list.push(entry);
    await set(wlKey(id), JSON.stringify(list));
  }
  return "added";
}

/** Creator removes a sign-up (e.g. a follower asks to be deleted). */
export async function removeFromWaitlist(id: string, index: number, phone: string): Promise<boolean> {
  const raws = await rawWaitlist(id);
  const raw = raws.find((r) => {
    const e = JSON.parse(r) as WaitlistEntry;
    return e.index === index && e.phone === phone;
  });
  if (!raw) return false;
  if (useRedis) {
    await redis(["LREM", wlKey(id), 1, raw]);
  } else {
    await set(wlKey(id), JSON.stringify(raws.filter((r) => r !== raw).map((r) => JSON.parse(r))));
  }
  return true;
}

// ---- funnel counters (anonymous totals; the denominator for "publish rate") ----
export const FUNNEL_EVENTS = ["wizard_started", "directions_shown", "store_generated", "published", "waitlist_join"] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export async function funnel(event: FunnelEvent): Promise<void> {
  try {
    await incr(`funnel:${event}`);
  } catch (err) {
    console.error("[funnel]", err);
  }
}

export async function getFunnel(): Promise<Record<FunnelEvent, number>> {
  const out = {} as Record<FunnelEvent, number>;
  for (const e of FUNNEL_EVENTS) out[e] = Number((await get(`funnel:${e}`)) || 0);
  return out;
}

// ---- rate limiting (fixed window) ----
/** Returns true if the caller is still under `limit` hits in the current window. */
export async function underLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const k = `rl:${key}:${bucket}`;
  if (useRedis) {
    const n = await redis<number>(["INCR", k]);
    if (n === 1) await redis(["EXPIRE", k, windowSec]);
    return n <= limit;
  }
  const db = await readFile();
  const n = Number(db[k] || 0) + 1;
  db[k] = String(n);
  await writeFile(db);
  return n <= limit;
}

export const storageMode = useRedis ? "redis" : "file";
/** On Vercel without Redis, data lives in /tmp and disappears: don't let creators publish into that. */
export const durableStorage = useRedis || !process.env.VERCEL;
