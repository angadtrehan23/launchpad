import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { bandFor, formatInr, normalisePrice } from "./pricing";
import {
  DIRECTIONS_SYSTEM,
  STORE_SYSTEM,
  directionsPrompt,
  fullStorePrompt,
  planPrompt,
  productPrompt,
  profilePrompt,
} from "./prompts";
import {
  BOOKABLE,
  CTA_LABELS,
  ctaOf,
  defaultCta,
  FORMATS,
  SP_FEATURES,
  type CreatorInput,
  type Direction,
  type PlanStep,
  type Product,
  type ProductFormat,
  type Storefront,
} from "./types";

/**
 * Provider choice (decided at boot from env, no code change needed):
 * - ANTHROPIC_API_KEY set → Claude with native structured output.
 * - otherwise any OpenAI-compatible chat endpoint (LLM_BASE_URL / LLM_API_KEY / LLM_MODEL),
 *   defaulting to Pollinations' free, keyless gateway (open-weights GPT-OSS 20B).
 *   Zero accounts, zero billing — chosen so the prototype runs on real LLM calls at no cost.
 *   Gemini, Groq or OpenRouter free tiers drop in the same way with their base URL + key.
 */
const PROVIDER: "anthropic" | "openai_compat" = process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai_compat";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.ANTHROPIC_EFFORT || "low") as "low" | "medium" | "high";
const LLM_BASE_URL = (process.env.LLM_BASE_URL || "https://text.pollinations.ai/openai").replace(/\/$/, "");
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || "openai";

// We own retries and the time budget ourselves (see withDeadline), so the SDK doesn't retry.
const client = PROVIDER === "anthropic" ? new Anthropic({ maxRetries: 0 }) : null;

/** Whole-request budget. Vercel caps the route at 60 s; leave room to save and respond. */
export const REQUEST_BUDGET_MS = 57_000;
const MIN_ATTEMPT_MS = 12_000;

// ---------- output contracts ----------
const ProductOut = z.object({
  title: z.string(),
  format: z.enum(FORMATS),
  priceInr: z.number(),
  priceRationale: z.string(),
  description: z.string(),
  highlights: z.array(z.string()),
  ctaLabel: z.string(),
});
const PlanOut = z.object({ when: z.string(), action: z.string(), feature: z.enum(SP_FEATURES) });

const StoreOut = z.object({
  status: z.enum(["ok", "needs_more_info"]),
  followUpQuestion: z.string(),
  assumption: z.string(),
  creator: z.object({ displayName: z.string(), tagline: z.string(), bio: z.string(), niche: z.string() }),
  products: z.array(ProductOut),
});
const DirectionsOut = z.object({
  status: z.enum(["ok", "needs_more_info"]),
  followUpQuestion: z.string(),
  directions: z.array(
    z.object({ title: z.string(), whyYou: z.string(), buyers: z.string(), productIdeas: z.array(z.string()), emoji: z.string() }),
  ),
});
const ProfileOut = z.object({ displayName: z.string(), tagline: z.string(), bio: z.string() });
const SingleProductOut = z.object({ product: ProductOut });
const PlanOnlyOut = z.object({ plan: z.array(PlanOut) });

// ---------- low-level call ----------
class ModelOutputError extends Error {}

class ProviderError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Pull the first JSON object out of a reply (models sometimes wrap it in prose or ```json fences). */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new ModelOutputError("no_json");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Small open models drift on enums ("E-book", "1:1 call"); map close-enough values before validating. */
function coerceEnums(value: unknown): unknown {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const FORMAT_ALIASES: Record<string, string> = { e_book: "ebook", guide: "ebook", pdf: "ebook", templates: "template_pack", template: "template_pack", course: "recorded_course", online_course: "recorded_course", cohort: "cohort_course", live_cohort: "cohort_course", "1_1": "one_on_one", "1_1_session": "one_on_one", "1_1_call": "one_on_one", one_on_one_call: "one_on_one", coaching: "one_on_one", webinar: "workshop", live_workshop: "workshop", membership: "community", paid_community: "community" };
  const FEATURE_ALIASES: Record<string, string> = { auto_dm_instagram: "auto_dm", instagram_auto_dm: "auto_dm", autodm: "auto_dm", waitlist: "lead_magnet", link_in_bio: "store", link_in_bio_store: "store", online_course: "course", one_on_one: "booking", telegram: "community", email_marketing: "email" };
  const fix = (v: unknown, allowed: readonly string[], aliases: Record<string, string>, fallback: string) => {
    if (typeof v !== "string") return fallback;
    const n = norm(v);
    if (allowed.includes(n)) return n;
    return aliases[n] && allowed.includes(aliases[n]) ? aliases[n] : fallback;
  };
  if (!value || typeof value !== "object") return value;
  const o = value as Record<string, unknown>;
  const fixProduct = (p: unknown) => {
    if (!p || typeof p !== "object") return p;
    const q = p as Record<string, unknown>;
    return { ...q, format: fix(q.format, FORMATS, FORMAT_ALIASES, "ebook"), priceInr: typeof q.priceInr === "string" ? Number(String(q.priceInr).replace(/[^\d.]/g, "")) : q.priceInr };
  };
  const fixStep = (s: unknown) => (s && typeof s === "object" ? { ...(s as object), feature: fix((s as Record<string, unknown>).feature, SP_FEATURES, FEATURE_ALIASES, "none") } : s);
  return {
    ...o,
    ...(typeof o.status === "string" ? { status: /more|info/i.test(o.status) ? "needs_more_info" : "ok" } : {}),
    ...(Array.isArray(o.products) ? { products: o.products.map(fixProduct) } : {}),
    ...(o.product ? { product: fixProduct(o.product) } : {}),
    ...(Array.isArray(o.plan) ? { plan: o.plan.map(fixStep) } : {}),
  };
}

/**
 * Small open models tend to echo a JSON Schema back instead of filling it in.
 * So we show them a filled-in skeleton of the exact shape (enums listed as "a|b|c").
 */
type JsonSchema = { type?: string; properties?: Record<string, JsonSchema>; items?: JsonSchema; enum?: unknown[] };
function skeleton(s: JsonSchema): unknown {
  if (s.enum) return s.enum.join("|");
  if (s.type === "object") return Object.fromEntries(Object.entries(s.properties || {}).map(([k, v]) => [k, skeleton(v)]));
  if (s.type === "array") return [skeleton(s.items || {})];
  if (s.type === "number" || s.type === "integer") return 0;
  if (s.type === "boolean") return false;
  return "…";
}

/** If the model wrapped the answer ({"storefront": {...}}), unwrap until the expected keys appear. */
function unwrap(value: unknown, keys: string[]): unknown {
  let v = value;
  for (let i = 0; i < 2 && v && typeof v === "object" && !Array.isArray(v); i++) {
    const o = v as Record<string, unknown>;
    if (keys.some((k) => k in o)) return o;
    const inner = Object.values(o).find((x) => x && typeof x === "object" && !Array.isArray(x) && keys.some((k) => k in (x as object)));
    if (!inner) return o;
    v = inner;
  }
  return v;
}

export type ChatMessage = { role: string; content: string };

function schemaKeys(schema: z.ZodType): string[] {
  return Object.keys((z.toJSONSchema(schema) as JsonSchema).properties || {});
}

/** System + user messages, with a filled-in example of the exact JSON shape (works for small open models). */
export function buildMessages(schema: z.ZodType, system: string, userPrompt: string): ChatMessage[] {
  const json = z.toJSONSchema(schema) as JsonSchema;
  const keys = Object.keys(json.properties || {});
  const shape = JSON.stringify(skeleton(json));
  return [
    {
      role: "system",
      content: `${system}\n\n# Output format\nReply with ONE JSON object only: no prose, no markdown fences, no wrapper key. Use exactly this shape and these top-level keys (${keys.join(", ")}). Every product must be a full object, never a plain string. Replace every "…" and 0 with real content. Where you see "a|b|c", pick exactly one of those values. Arrays may have as many items as the instructions ask for:\n${shape}`,
    },
    { role: "user", content: userPrompt },
  ];
}

/** Accept "almost right" replies in one shot: drop non-object products, default a missing plan or list. */
function lenient(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const o = { ...(value as Record<string, unknown>) };
  if (Array.isArray(o.products)) o.products = o.products.filter((x) => x && typeof x === "object");
  if (Array.isArray(o.plan)) o.plan = o.plan.filter((x) => x && typeof x === "object");
  if ("creator" in o || "directions" in o) {
    if (typeof o.followUpQuestion !== "string") o.followUpQuestion = "";
    if (typeof o.assumption !== "string" && "creator" in o) o.assumption = "";
  }
  return o;
}

/** Parse a reply produced elsewhere (the visitor's browser) with the same rules as our own calls. */
export function parseReply<S extends z.ZodType>(schema: S, text: string): z.infer<S> {
  const parsed = schema.safeParse(lenient(coerceEnums(unwrap(extractJson(text), schemaKeys(schema)))));
  if (!parsed.success) throw new ModelOutputError("schema");
  return parsed.data as z.infer<S>;
}

/** OpenAI-compatible chat call that must return JSON matching `schema`; one in-call repair on bad JSON. */
/** When the free tier last told us to wait (per server instance). Lets the UI say "ready in ~Ns". */
let cooldownUntil = 0;
export function aiCooldownSecs(): number {
  return Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
}

async function callOpenAICompat<S extends z.ZodType>(schema: S, system: string, userPrompt: string, timeoutMs: number): Promise<z.infer<S>> {
  const deadline = Date.now() + timeoutMs;
  // Known cooldown longer than our budget: don't waste a request.
  if (cooldownUntil - Date.now() > timeoutMs - 7_000) throw new ProviderError("rate_limit", `cooling down ${aiCooldownSecs()}s`);
  const keys = schemaKeys(schema);
  const messages = buildMessages(schema, system, userPrompt);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 4000) throw new ModelOutputError("timeout");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), remaining);
    let text = "";
    try {
      const url = LLM_BASE_URL.endsWith("/chat/completions") || LLM_BASE_URL.endsWith("/openai") ? LLM_BASE_URL : `${LLM_BASE_URL}/chat/completions`;
      const send = () =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(LLM_API_KEY ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}) },
          body: JSON.stringify({ model: LLM_MODEL, messages, response_format: { type: "json_object" }, temperature: 0.7 }),
          signal: ctrl.signal,
        });
      let res = await send();
      // Free tiers rate-limit with a cooldown ("Retry after 16s"). Wait it out if the budget allows.
      for (let waits = 0; (res.status === 429 || res.status === 402) && waits < 2; waits++) {
        const body = await res.text();
        const secs = Number(res.headers.get("retry-after")) || Number(body.match(/retry after (\d+)\s*s/i)?.[1]) || 0;
        if (secs) cooldownUntil = Math.max(cooldownUntil, Date.now() + secs * 1000);
        if (!secs || Date.now() + secs * 1000 + 7_000 > deadline) throw new ProviderError("rate_limit", `provider cooldown ${secs}s`);
        console.log(`[llm] free-tier cooldown, waiting ${secs + 1}s`);
        await new Promise((r) => setTimeout(r, (secs + 1) * 1000));
        res = await send();
      }
      if (res.status === 429 || res.status === 402) throw new ProviderError("rate_limit", "provider rate limited");
      if (res.status === 401 || res.status === 403) throw new ProviderError("auth", `provider auth ${res.status}`);
      if (!res.ok) throw new ProviderError(`api_${res.status}`, (await res.text()).slice(0, 200));
      const data = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
      const choice = data.choices?.[0];
      if (choice?.finish_reason === "length") throw new ModelOutputError("truncated");
      text = choice?.message?.content || "";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new ModelOutputError("timeout");
      throw err;
    } finally {
      clearTimeout(timer);
    }
    try {
      const parsed = schema.safeParse(lenient(coerceEnums(unwrap(extractJson(text), keys))));
      if (parsed.success) return parsed.data as z.infer<S>;
      console.warn(`[llm] schema mismatch: ${parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")} | reply: ${text.slice(0, 300).replace(/\s+/g, " ")}`);
      if (attempt === 2) throw new ModelOutputError("schema");
      messages.push({ role: "assistant", content: text.slice(0, 6000) });
      messages.push({ role: "user", content: `That JSON doesn't match the schema: ${parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}. Reply with the corrected JSON object only.` });
    } catch (err) {
      if (err instanceof ModelOutputError && err.message === "schema") throw err;
      console.warn(`[llm] unparseable reply (${text.length} chars): ${text.slice(0, 300).replace(/\s+/g, " ")}`);
      if (attempt === 2) throw new ModelOutputError("unparseable");
      messages.push({ role: "assistant", content: text.slice(0, 6000) });
      messages.push({ role: "user", content: "That wasn't valid JSON. Reply with the JSON object only." });
    }
  }
  throw new ModelOutputError("unparseable");
}

async function callModel<S extends z.ZodType>(schema: S, system: string, userPrompt: string, timeoutMs: number): Promise<z.infer<S>> {
  // Kill switch: AI_DISABLED=true serves labelled starter content only.
  if (process.env.AI_DISABLED === "true") throw new ModelOutputError("disabled");
  if (PROVIDER !== "anthropic" || !client) return callOpenAICompat(schema, system, userPrompt, timeoutMs);
  const res = await client.messages.parse(
    {
      model: MODEL,
      max_tokens: 8000,
      system,
      output_config: { effort: EFFORT, format: zodOutputFormat(schema) },
      messages: [{ role: "user", content: userPrompt }],
    },
    { timeout: timeoutMs },
  );
  if (res.stop_reason === "refusal") throw new ModelOutputError("refusal");
  if (res.stop_reason === "max_tokens") throw new ModelOutputError("truncated");
  if (!res.parsed_output) throw new ModelOutputError("unparseable");
  return res.parsed_output as z.infer<S>;
}

function describeFailure(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "auth";
  if (err instanceof Anthropic.RateLimitError) return "rate_limit";
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (err instanceof Anthropic.APIError) return `api_${err.status}`;
  if (err instanceof ModelOutputError) return err.message;
  if (err instanceof ProviderError) return err.code;
  if (err instanceof Error && /authentication method/i.test(err.message)) return "auth"; // no API key configured
  return "unknown";
}

/**
 * Up to 2 attempts inside one deadline. Attempt 1 gets most of the budget;
 * attempt 2 only runs if there's enough time left. `check` turns bad content into feedback.
 */
async function withDeadline<T>(
  label: string,
  run: (timeoutMs: number, feedback?: string[]) => Promise<{ value: T; issues: string[] }>,
  budgetMs = REQUEST_BUDGET_MS,
): Promise<{ value: T | null; failure: string; ms: number }> {
  const start = Date.now();
  let feedback: string[] | undefined;
  let failure = "";
  let last: T | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = budgetMs - (Date.now() - start);
    if (remaining < MIN_ATTEMPT_MS) break;
    // Claude: cap attempt 1 so a retry fits. Free tiers: give attempt 1 the whole budget (it may need to wait out a cooldown).
    const timeout = attempt === 1 && PROVIDER === "anthropic" ? Math.min(remaining, 35_000) : remaining;
    try {
      const { value, issues } = await run(timeout, feedback);
      last = value;
      if (!issues.length) return { value, failure: "", ms: Date.now() - start };
      feedback = issues;
      failure = `quality: ${issues.join("; ")}`;
    } catch (err) {
      failure = describeFailure(err);
      console.error(`[${label}] attempt ${attempt} failed: ${failure}`, err instanceof Error ? err.message : "");
      if (failure === "auth") break;
    }
  }
  // A draft with minor issues beats no draft.
  return { value: last, failure, ms: Date.now() - start };
}

// ---------- quality control ----------
const clip = (s: string, n: number) => {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
};

export const RISKY =
  /\b(guarantee[ds]?|guaranteed|100% (results|returns|success|profit)|get rich|double your (money|income)|cures?d?|risk[- ]free returns|lose \d+\s?kg)\b/i;

export function reviewProduct(p: z.infer<typeof ProductOut>, input: CreatorInput, issues: string[], label: string): Product {
  const format: ProductFormat = FORMATS.includes(p.format) ? p.format : "ebook";
  const { price, adjusted } = normalisePrice(p.priceInr, format, input.audience);
  let rationale = clip(p.priceRationale, 170);
  if (adjusted) {
    rationale = /₹\s?[\d,]+/.test(rationale) ? rationale.replace(/₹\s?[\d,]+/, formatInr(price)) : rationale;
    const [min, max] = bandFor(format, input.audience);
    if (!rationale) rationale = `Sits inside the ${formatInr(min)}–${formatInr(max)} range that works for this format at your audience size.`;
  }
  const highlights = (p.highlights || []).map((h) => clip(h, 60)).filter(Boolean).slice(0, 3);
  const out: Product = {
    title: clip(p.title.replace(/^\s*₹\s?[\d,]+\s*[-–:|]?\s*/, ""), 70), // prices belong in the price, not the title
    format,
    priceInr: price,
    priceRationale: rationale,
    description: clip(p.description, 380),
    highlights,
    ctaLabel: clip(p.ctaLabel, 26),
  };
  // Buttons come from a fixed list, each tied to what happens when a customer taps it.
  if (!CTA_LABELS.includes(out.ctaLabel)) out.ctaLabel = defaultCta(format);
  if (BOOKABLE.includes(format) && ctaOf(out).action === "waitlist") out.ctaLabel = defaultCta(format);
  if (!out.title) issues.push(`${label} has no title.`);
  if (out.description.length < 40) issues.push(`${label} description is missing or too short.`);
  if (RISKY.test(`${out.title} ${out.description} ${highlights.join(" ")}`)) issues.push(`${label} makes a guaranteed-result, cure or income claim; remove it.`);
  return out;
}

function reviewPlan(plan: z.infer<typeof PlanOut>[]): PlanStep[] {
  return plan
    .filter((s) => s.action?.trim())
    .slice(0, 6)
    .map((s) => ({ when: clip(s.when, 20) || "Next", action: clip(s.action, 160), feature: SP_FEATURES.includes(s.feature) ? s.feature : "none" }));
}

function reviewStore(raw: z.infer<typeof StoreOut>, input: CreatorInput) {
  const issues: string[] = [];
  let products = raw.products.slice(0, 4).map((p, i) => reviewProduct(p, input, issues, `Product ${i + 1}`));
  if (products.length < 2) issues.push("Give at least 2 products (3 is ideal).");
  if (products.length >= 3 && new Set(products.map((p) => p.format)).size === 1) issues.push("All products use the same format; vary them.");
  const seen = new Set<string>();
  products = products.filter((p) => !seen.has(p.title.toLowerCase()) && seen.add(p.title.toLowerCase()));
  const plan: PlanStep[] = [];
  const creator = {
    displayName: input.name || clip(raw.creator.displayName, 40) || "Creator", // always the name the creator gave us
    handle: input.handle,
    tagline: clip(raw.creator.tagline, 90),
    bio: clip(raw.creator.bio, 320),
    niche: clip(raw.creator.niche, 40) || input.niche,
  };
  if (!creator.bio) issues.push("Bio is empty.");
  if (!creator.tagline) issues.push("Tagline is empty.");
  if (RISKY.test(`${creator.tagline} ${creator.bio}`)) issues.push("The bio makes a guaranteed-result, cure or income claim; remove it.");
  return { creator, products, plan, issues };
}

// ---------- starter fallbacks (only when the model is unavailable) ----------
/** Topic for templates. Uses only our own keyword list or the chosen direction — never raw free text. */
function topicOf(input: CreatorInput): string {
  return (input.direction?.title || input.keywords[0] || "your expertise").toLowerCase();
}
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function starterStore(input: CreatorInput): Storefront {
  const topic = topicOf(input);
  const T = titleCase(topic);
  const mk = (format: ProductFormat, title: string, description: string, highlights: string[], ctaLabel: string): Product => {
    const [min, max] = bandFor(format, input.audience);
    const { price } = normalisePrice((min + max) / 2, format, input.audience);
    return { title, format, priceInr: price, priceRationale: `Middle of the ${formatInr(min)}–${formatInr(max)} range for this format at your audience size.`, description, highlights, ctaLabel };
  };
  return {
    creator: {
      displayName: input.name || "Your name",
      handle: input.handle,
      tagline: `Practical ${topic}, made simple`,
      bio: `I share practical ${topic} tips. This is where you can learn directly from me — join the waitlist for what's coming next.`,
      niche: topic,
    },
    products: [
      mk("ebook", `The ${T} Starter Guide`, `A short, practical guide to the basics of ${topic}, written for complete beginners.`, ["Step-by-step basics", "Common mistakes to avoid", "Printable checklist"], "Get early access"),
      mk("workshop", `Live ${T} Q&A`, `A 60-minute live session where I walk through ${topic} and answer your questions.`, ["60-min live session", "Recording included", "Open Q&A"], "Request a slot"),
      mk("one_on_one", `1:1 ${T} Clarity Call`, `A focused 30-minute call to look at your situation and leave with a clear next step.`, ["30-min video call", "Personal action plan", "Follow-up notes"], "Request a slot"),
    ],
    plan: input.platforms.some((p) => p.platform === "instagram")
      ? [
      { when: "Day 1", action: "Publish this store and put the link in your Instagram bio.", feature: "store" },
      { when: "Day 2", action: `Post a reel on your top 3 ${topic} tips and ask people to comment GUIDE for early access.`, feature: "auto_dm" },
      { when: "Day 4", action: "Share a story poll: which product would you buy first?", feature: "lead_magnet" },
      { when: "Week 2", action: "Create the product with the most waitlist sign-ups.", feature: "digital_product" },
      { when: "Week 2", action: "Turn on payments and message everyone on the waitlist.", feature: "email" },
    ]
      : [
      { when: "Day 1", action: "Publish this store and share the link on your WhatsApp status and with past students or clients.", feature: "store" },
      { when: "Day 2", action: `Send a short note to your WhatsApp groups: 3 quick ${topic} tips, then the waitlist link.`, feature: "lead_magnet" },
      { when: "Day 4", action: "Ask 5 people who know your work which product they'd buy first.", feature: "none" },
      { when: "Week 2", action: "Create the product with the most waitlist sign-ups.", feature: "digital_product" },
      { when: "Week 2", action: "Turn on payments and message everyone on the waitlist.", feature: "email" },
    ],
    theme: "candy",
    language: input.language,
  };
}

/** Rules-only directions from the creator's own keyword picks, used if the AI is down. */
function starterDirections(input: CreatorInput): Direction[] {
  const picks = input.keywords.length ? input.keywords : ["Your expertise"];
  const angles = [
    { t: (k: string) => `${k} for beginners`, buyers: "Followers who want to start but don't know where to begin.", ideas: ["Starter guide (PDF)", "Live Q&A workshop", "Beginner checklist"], emoji: "🌱" },
    { t: (k: string) => `${k}, made simple for busy people`, buyers: "People short on time who want a quick, proven routine.", ideas: ["7-day plan (PDF)", "Template pack", "Weekend workshop"], emoji: "⚡" },
    { t: (k: string) => `Personal ${k.toLowerCase()} guidance`, buyers: "Followers who want answers for their own situation.", ideas: ["1:1 clarity call", "Monthly community", "Small-group cohort"], emoji: "🤝" },
  ];
  return angles.map((a, i) => {
    const k = picks[i % picks.length];
    return { title: a.t(k), whyYou: `You picked ${k.toLowerCase()} as a topic you post about.`, buyers: a.buyers, productIdeas: a.ideas, emoji: a.emoji };
  });
}

// ---------- public API ----------
export type DirectionsResult =
  | { kind: "ok"; directions: Direction[]; source: "ai" | "starter"; ms: number }
  | { kind: "needs_more"; question: string };

export function directionsMessages(input: CreatorInput, avoid: string[] = []): ChatMessage[] {
  return buildMessages(DirectionsOut, DIRECTIONS_SYSTEM, directionsPrompt(input, avoid));
}
export function storeMessages(input: CreatorInput, opts: { force?: boolean } = {}): ChatMessage[] {
  return buildMessages(StoreOut, STORE_SYSTEM, fullStorePrompt(input, opts));
}

export async function generateDirections(input: CreatorInput, avoid: string[] = [], prefetched?: string): Promise<DirectionsResult> {
  let usePrefetched = !!prefetched;
  let needsMore = "";
  const r = await withDeadline("directions", async (timeout) => {
    let raw: z.infer<typeof DirectionsOut>;
    if (usePrefetched) {
      usePrefetched = false; // only the first attempt; a retry calls the model from the server
      raw = parseReply(DirectionsOut, prefetched!);
    } else raw = await callModel(DirectionsOut, DIRECTIONS_SYSTEM, directionsPrompt(input, avoid), timeout);
    if (raw.status === "needs_more_info") {
      needsMore = clip(raw.followUpQuestion, 200) || "Tell us a bit more about what you post and who follows you.";
      return { value: [] as Direction[], issues: [] };
    }
    const directions = raw.directions.slice(0, 3).map((d) => ({
      title: clip(d.title, 70),
      whyYou: clip(d.whyYou, 160),
      buyers: clip(d.buyers, 130),
      productIdeas: d.productIdeas.map((x) => clip(x, 50)).filter(Boolean).slice(0, 3),
      emoji: clip(d.emoji, 4) || "✨",
    }));
    const issues: string[] = [];
    if (directions.length < 3) issues.push("Give exactly 3 directions.");
    if (directions.some((d) => RISKY.test(`${d.title} ${d.buyers} ${d.productIdeas.join(" ")}`))) issues.push("Remove guaranteed-result, cure or income claims.");
    return { value: directions, issues };
  }, REQUEST_BUDGET_MS);

  if (needsMore) return { kind: "needs_more", question: needsMore };
  if (r.value && r.value.length >= 2) return { kind: "ok", directions: r.value, source: "ai", ms: r.ms };
  return { kind: "ok", directions: starterDirections(input), source: "starter", ms: r.ms };
}

export type GenerateResult =
  | { kind: "ok"; store: Storefront; source: "ai" | "starter"; assumption: string; notice?: string; ms: number }
  | { kind: "needs_more"; question: string };

export async function generateStore(
  input: CreatorInput,
  opts: { force?: boolean; avoidTitles?: string[]; hint?: string; theme?: Storefront["theme"]; confirmed?: Storefront["creator"]; prefetched?: string } = {},
): Promise<GenerateResult> {
  let usePrefetched = !!opts.prefetched;
  let needsMore = "";
  let assumption = "";
  const r = await withDeadline("generate", async (timeout, feedback) => {
    let raw: z.infer<typeof StoreOut>;
    if (usePrefetched) {
      usePrefetched = false;
      raw = parseReply(StoreOut, opts.prefetched!);
    } else raw = await callModel(StoreOut, STORE_SYSTEM, fullStorePrompt(input, { ...opts, feedback }), timeout);
    if (raw.status === "needs_more_info" && !opts.force && !input.direction) {
      needsMore = clip(raw.followUpQuestion, 200) || "Tell us a bit more about what you post and who follows you.";
      return { value: null, issues: [] };
    }
    assumption = clip(raw.assumption, 200);
    const reviewed = reviewStore(raw, input);
    if (opts.confirmed?.displayName) reviewed.creator.displayName = opts.confirmed.displayName;
    return { value: reviewed, issues: reviewed.issues };
  });

  if (needsMore) return { kind: "needs_more", question: needsMore };
  const v = r.value;
  if (v && v.products.length >= 2 && !RISKY.test(JSON.stringify(v.products) + v.creator.bio)) {
    return {
      kind: "ok",
      source: "ai",
      assumption,
      ms: r.ms,
      store: { creator: v.creator, products: v.products, plan: v.plan, theme: opts.theme || "candy", language: input.language },
    };
  }
  return {
    kind: "ok",
    source: "starter",
    assumption: "",
    ms: r.ms,
    store: { ...starterStore(input), theme: opts.theme || "candy" },
    notice: "We drafted a starter version from your answers. Tap “Regenerate all” for a more tailored one.",
  };
}

export async function regenerateProfile(input: CreatorInput, store: Storefront, hint?: string) {
  const r = await withDeadline("profile", async (timeout) => {
    const out = await callModel(ProfileOut, STORE_SYSTEM, profilePrompt(input, store, hint), timeout);
    const value = {
      displayName: store.creator.displayName, // never renamed by AI
      tagline: clip(out.tagline, 90) || store.creator.tagline,
      bio: clip(out.bio, 320) || store.creator.bio,
    };
    return { value, issues: RISKY.test(value.bio + value.tagline) ? ["Remove guaranteed-result, cure or income claims."] : [] };
  });
  if (!r.value || RISKY.test(r.value.bio + r.value.tagline)) throw new ModelOutputError(r.failure || "failed");
  return r.value;
}

export async function regenerateProduct(input: CreatorInput, store: Storefront, index: number, hint?: string): Promise<Product> {
  const r = await withDeadline("product", async (timeout) => {
    const out = await callModel(SingleProductOut, STORE_SYSTEM, productPrompt(input, store, index, hint), timeout);
    const issues: string[] = [];
    const value = reviewProduct(out.product, input, issues, "Product");
    return { value, issues };
  });
  if (!r.value || RISKY.test(JSON.stringify(r.value))) throw new ModelOutputError(r.failure || "failed");
  return r.value;
}

export async function regeneratePlan(input: CreatorInput, store: Storefront, hint?: string): Promise<PlanStep[]> {
  const r = await withDeadline("plan", async (timeout) => {
    const out = await callModel(PlanOnlyOut, STORE_SYSTEM, planPrompt(input, store, hint), timeout);
    const value = reviewPlan(out.plan);
    return { value, issues: value.length < 3 ? ["The plan needs 5 steps."] : [] };
  });
  if (!r.value || r.value.length < 3) throw new ModelOutputError(r.failure || "failed");
  return r.value;
}

export const aiConfig = { provider: PROVIDER, model: PROVIDER === "anthropic" ? MODEL : LLM_MODEL, effort: EFFORT };
