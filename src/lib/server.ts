import { getStore, slugTaken, underLimit } from "./db";
import { cleanAvatar } from "./input";
import { FORMATS, LANGUAGES, SP_FEATURES, THEMES, type PlanStep, type Product, type StoreRecord, type Storefront } from "./types";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export async function loadAuthed(req: Request, id: string): Promise<StoreRecord | Response> {
  const rec = await getStore(id);
  if (!rec) return json({ error: "This store doesn't exist anymore." }, 404);
  const token = req.headers.get("x-edit-token");
  if (!token || token !== rec.editToken) return json({ error: "You don't have edit access to this store." }, 403);
  return rec;
}

/** Public shape of a record — never leak the edit token. */
export function publicRecord(rec: StoreRecord) {
  const rest: Omit<StoreRecord, "editToken"> & { editToken?: string } = { ...rec };
  delete rest.editToken;
  return rest;
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/**
 * Cost protection for the public AI endpoints: per-IP hourly limit plus a global daily cap.
 * Returns a Response to send back when limited, or null to continue.
 */
export async function aiRateLimit(req: Request, kind: "generate" | "regen"): Promise<Response | null> {
  const dev = process.env.NODE_ENV !== "production" ? 20 : 1; // generous locally so testing doesn't trip it
  const perHour = (kind === "generate" ? Number(process.env.RL_GENERATE_PER_HOUR || 12) : Number(process.env.RL_REGEN_PER_HOUR || 40)) * dev;
  const daily = Number(process.env.RL_AI_PER_DAY || 1500);
  try {
    const ip = clientIp(req);
    if (!(await underLimit(`${kind}:${ip}`, perHour, 3600))) {
      return json({ status: "error", error: "You've made a lot of versions in the last hour. Take a breather and try again in a bit.", message: "You've made a lot of versions in the last hour. Try again in a bit." }, 429);
    }
    if (!(await underLimit("ai:all", daily, 86400))) {
      return json({ status: "error", error: "We're getting a lot of creators today. Please try again tomorrow.", message: "We're getting a lot of creators today. Please try again tomorrow." }, 429);
    }
  } catch (err) {
    console.error("[rate-limit] check failed, allowing", err); // fail open: a limiter outage shouldn't block creators
  }
  return null;
}

export async function makeSlug(base: string): Promise<string> {
  const root =
    base
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "store";
  // Always suffixed: without ownership verification, nobody gets to claim the bare /s/<handle>.
  for (let i = 0; i < 5; i++) {
    const s = `${root}-${Math.random().toString(36).slice(2, 6)}`;
    if (!(await slugTaken(s))) return s;
  }
  return `${root}-${crypto.randomUUID().slice(0, 8)}`;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Accept creator edits but keep the shape and sizes sane. Creators may set any price they like. */
export function sanitizeDraft(raw: unknown, fallback: Storefront): Storefront {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Partial<Storefront>;
  const c = (r.creator || {}) as Partial<Storefront["creator"]>;
  const products: Product[] = Array.isArray(r.products)
    ? r.products.slice(0, 6).map((p: Partial<Product>) => ({
        title: str(p.title, 100),
        format: FORMATS.includes(p.format as never) ? (p.format as Product["format"]) : "ebook",
        priceInr: Math.max(0, Math.min(100000, Math.round(Number(p.priceInr) || 0))),
        priceRationale: str(p.priceRationale, 300),
        description: str(p.description, 600),
        highlights: Array.isArray(p.highlights) ? p.highlights.slice(0, 5).map((h) => str(h, 80)) : [],
        ctaLabel: str(p.ctaLabel, 30),
      }))
    : fallback.products;
  const plan: PlanStep[] = Array.isArray(r.plan)
    ? r.plan.slice(0, 8).map((s: Partial<PlanStep>) => ({
        when: str(s.when, 20),
        action: str(s.action, 200),
        feature: SP_FEATURES.includes(s.feature as never) ? (s.feature as PlanStep["feature"]) : "none",
      }))
    : fallback.plan || [];
  return {
    creator: {
      displayName: str(c.displayName, 60),
      handle: fallback.creator.handle,
      tagline: str(c.tagline, 120),
      bio: str(c.bio, 500),
      niche: str(c.niche, 60),
      avatar: cleanAvatar(c.avatar),
      whatsapp: /^[6-9]\d{9}$/.test(String(c.whatsapp || "").replace(/\D/g, "").slice(-10)) ? String(c.whatsapp).replace(/\D/g, "").slice(-10) : "",
    },
    products,
    plan,
    theme: THEMES.includes(r.theme as never) ? (r.theme as Storefront["theme"]) : fallback.theme,
    language: LANGUAGES.includes(r.language as never) ? (r.language as Storefront["language"]) : fallback.language,
  };
}
