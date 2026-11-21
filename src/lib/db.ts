import { promises as fs } from "fs";
import path from "path";
import type { CreatorAccount, CustomerRequest, SavedStore } from "./types";

/**
 * Tiny key-value layer.
 * - Production: Upstash Redis over its REST API (connected from Vercel → Storage, which sets
 *   KV_REST_API_URL / KV_REST_API_TOKEN or UPSTASH_REDIS_REST_*).
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
let chain: Promise<unknown> = Promise.resolve();
async function readFile(): Promise<FileDb> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as FileDb;
  } catch {
    return {};
  }
}
/** Serialise file writes so parallel requests in dev don't clobber each other. */
function withFile<T>(fn: (db: FileDb) => T | Promise<T>, write = true): Promise<T> {
  const run = chain.then(async () => {
    const db = await readFile();
    const out = await fn(db);
    if (write) {
      await fs.mkdir(path.dirname(FILE), { recursive: true });
      await fs.writeFile(FILE, JSON.stringify(db));
    }
    return out;
  });
  chain = run.catch(() => undefined);
  return run;
}
const arr = (db: FileDb, k: string): string[] => (db[k] ? (JSON.parse(db[k]) as string[]) : []);

async function get(key: string): Promise<string | null> {
  if (useRedis) return redis<string | null>(["GET", key]);
  return withFile((db) => db[key] ?? null, false);
}
async function set(key: string, value: string, ttlSec?: number): Promise<void> {
  if (useRedis) {
    await redis(ttlSec ? ["SET", key, value, "EX", ttlSec] : ["SET", key, value]);
    return;
  }
  await withFile((db) => {
    db[key] = value;
  });
}
/** Set only if the key doesn't exist yet. Returns true if it was set. */
async function setNew(key: string, value: string): Promise<boolean> {
  if (useRedis) return (await redis<string | null>(["SET", key, value, "NX"])) === "OK";
  return withFile((db) => {
    if (db[key] !== undefined) return false;
    db[key] = value;
    return true;
  });
}
async function del(key: string): Promise<void> {
  if (useRedis) {
    await redis(["DEL", key]);
    return;
  }
  await withFile((db) => {
    delete db[key];
  });
}
async function incr(key: string): Promise<number> {
  if (useRedis) return redis<number>(["INCR", key]);
  return withFile((db) => {
    db[key] = String(Number(db[key] || 0) + 1);
    return Number(db[key]);
  });
}
async function sadd(key: string, member: string): Promise<void> {
  if (useRedis) {
    await redis(["SADD", key, member]);
    return;
  }
  await withFile((db) => {
    const a = arr(db, key);
    if (!a.includes(member)) db[key] = JSON.stringify([...a, member]);
  });
}
async function srem(key: string, member: string): Promise<void> {
  if (useRedis) {
    await redis(["SREM", key, member]);
    return;
  }
  await withFile((db) => {
    db[key] = JSON.stringify(arr(db, key).filter((m) => m !== member));
  });
}
async function smembers(key: string): Promise<string[]> {
  if (useRedis) return (await redis<string[]>(["SMEMBERS", key])) || [];
  return withFile((db) => arr(db, key), false);
}
async function rpush(key: string, value: string): Promise<void> {
  if (useRedis) {
    await redis(["RPUSH", key, value]);
    return;
  }
  await withFile((db) => {
    db[key] = JSON.stringify([...arr(db, key), value]);
  });
}
async function lrange(key: string): Promise<string[]> {
  if (useRedis) return (await redis<string[]>(["LRANGE", key, 0, -1])) || [];
  return withFile((db) => arr(db, key), false);
}
async function mget(keys: string[]): Promise<(string | null)[]> {
  if (!keys.length) return [];
  if (useRedis) return redis<(string | null)[]>(["MGET", ...keys]);
  return withFile((db) => keys.map((k) => db[k] ?? null), false);
}

// ---- creators ----
export async function getCreator(id: string): Promise<CreatorAccount | null> {
  const raw = await get(`creator:${id}`);
  return raw ? (JSON.parse(raw) as CreatorAccount) : null;
}
export async function saveCreator(c: CreatorAccount): Promise<void> {
  await set(`creator:${c.id}`, JSON.stringify(c));
  await sadd("creators", c.id);
}
export async function creatorIdByPhone(phone: string): Promise<string | null> {
  return get(`phone:${phone}`);
}
/** Claims the phone number for this account. False if someone already has it. */
export async function claimPhone(phone: string, id: string): Promise<boolean> {
  return setNew(`phone:${phone}`, id);
}
export async function listCreators(): Promise<CreatorAccount[]> {
  const ids = await smembers("creators");
  const raws = await mget(ids.map((id) => `creator:${id}`));
  return raws.filter(Boolean).map((r) => JSON.parse(r!) as CreatorAccount);
}
export async function deleteCreator(c: CreatorAccount): Promise<void> {
  for (const sid of c.storeIds) {
    const s = await getSaved(sid);
    if (s?.slug) await del(`slug:${s.slug}`);
    await del(`store:${sid}`);
    await del(`req:${sid}`);
  }
  await del(`phone:${c.phone}`);
  await del(`creator:${c.id}`);
  await srem("creators", c.id);
}

// ---- sessions (random token in an httpOnly cookie → creator id) ----
const SESSION_DAYS = 30;
export async function createSession(prefix: "sess" | "asess", value: string): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await set(`${prefix}:${token}`, value, SESSION_DAYS * 86400);
  return token;
}
export async function readSession(prefix: "sess" | "asess", token: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return get(`${prefix}:${token}`);
}
export async function endSession(prefix: "sess" | "asess", token: string): Promise<void> {
  if (/^[a-f0-9]{64}$/.test(token)) await del(`${prefix}:${token}`);
}
export const SESSION_MAX_AGE = SESSION_DAYS * 86400;

// ---- admin password (set once, by whoever runs the platform) ----
export async function getAdminHash(): Promise<string | null> {
  return get("admin:pass");
}
export async function claimAdmin(hash: string): Promise<boolean> {
  return setNew("admin:pass", hash);
}

// ---- stores ----
export async function getSaved(id: string): Promise<SavedStore | null> {
  const raw = await get(`store:${id}`);
  return raw ? (JSON.parse(raw) as SavedStore) : null;
}
export async function putSaved(s: SavedStore): Promise<void> {
  await set(`store:${s.id}`, JSON.stringify(s));
}
export async function getSavedMany(ids: string[]): Promise<SavedStore[]> {
  const raws = await mget(ids.map((id) => `store:${id}`));
  return raws.filter(Boolean).map((r) => JSON.parse(r!) as SavedStore);
}
export async function storeIdBySlug(slug: string): Promise<string | null> {
  return get(`slug:${slug}`);
}
export async function claimSlug(slug: string, id: string): Promise<boolean> {
  return setNew(`slug:${slug}`, id);
}

// ---- customer requests (waitlist joins, slot requests, questions) ----
export async function addRequest(storeId: string, r: CustomerRequest): Promise<"added" | "duplicate" | "full"> {
  const list = await getRequests(storeId);
  if (list.length >= 2000) return "full";
  if (list.some((x) => x.phone === r.phone && x.index === r.index)) return "duplicate";
  await rpush(`req:${storeId}`, JSON.stringify(r));
  return "added";
}
export async function getRequests(storeId: string): Promise<CustomerRequest[]> {
  return (await lrange(`req:${storeId}`)).map((x) => JSON.parse(x) as CustomerRequest);
}
export async function countRequests(storeIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const id of storeIds) out[id] = useRedis ? await redis<number>(["LLEN", `req:${id}`]) : (await getRequests(id)).length;
  return out;
}

// ---- public page counters ----
export async function track(slug: string, kind: "view" | "click", index = 0): Promise<void> {
  await incr(kind === "view" ? `views:${slug}` : `clicks:${slug}:${index}`);
}
export async function getViews(slug: string): Promise<number> {
  return Number((await get(`views:${slug}`)) || 0);
}

// ---- funnel counters (anonymous totals; the denominator for "publish rate") ----
export const FUNNEL_EVENTS = ["signed_up", "wizard_started", "directions_shown", "store_generated", "published", "waitlist_join"] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export async function funnel(event: FunnelEvent): Promise<void> {
  try {
    await incr(`funnel:${event}`);
  } catch (err) {
    console.error("[funnel]", err);
  }
}

export async function getFunnel(): Promise<Record<FunnelEvent, number>> {
  const vals = await mget(FUNNEL_EVENTS.map((e) => `funnel:${e}`));
  const out = {} as Record<FunnelEvent, number>;
  FUNNEL_EVENTS.forEach((e, i) => (out[e] = Number(vals[i] || 0)));
  return out;
}

// ---- rate limiting (fixed window) ----
/** Returns true if the caller is still under `limit` hits in the current window. */
export async function underLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const k = `rl:${key}:${bucket}`;
  const n = await incr(k);
  if (useRedis && n === 1) await redis(["EXPIRE", k, windowSec]);
  return n <= limit;
}

export const storageMode = useRedis ? "redis" : "file";
/** On Vercel without Redis, data lives in /tmp and disappears: refuse accounts rather than lose them. */
export const durableStorage = useRedis || !process.env.VERCEL;
