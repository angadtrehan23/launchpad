import {
  EARNINGS,
  FOLLOWER_MID,
  FOLLOWER_RANGES,
  KEYWORD_GROUPS,
  LANGUAGES,
  PLATFORMS,
  type AudienceTier,
  type CreatorInput,
  type Direction,
  type Earning,
  type FollowerRange,
  type Language,
  type Platform,
  type PlatformPresence,
} from "./types";

export const LIMITS = { description: 600, handle: 80, keywords: 6, customKeyword: 30 };

/** Instagram usernames: letters, digits, dot, underscore; max 30; no leading/trailing dot or "..". */
const IG_HANDLE_RE = /^(?!.*\.\.)(?!\.)(?!.*\.$)[a-zA-Z0-9._]{1,30}$/;

export function cleanHandle(raw: string): string {
  let h = (raw || "").trim();
  // Accept pasted links: instagram.com/name, youtube.com/@name, t.me/name, linkedin.com/in/name …
  const m = h.match(/(?:instagram\.com|youtube\.com|x\.com|twitter\.com|t\.me|snapchat\.com\/add|linkedin\.com\/in)\/@?([^/?#\s]+)/i);
  if (m) h = m[1];
  return h.replace(/^@+/, "").trim().slice(0, LIMITS.handle);
}

export function isValidInstagramHandle(h: string): boolean {
  return IG_HANDLE_RE.test(h);
}

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];

/** Cheap deterministic check before spending an AI call. The model catches subtler cases itself. */
export function looksLikeGibberish(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  const letters = t.replace(/[^a-zऀ-ॿ]/g, "");
  if (letters.length < 3) return true;
  if (/(.)\1{4,}/.test(t)) return true; // "aaaaaa"
  const latin = t.replace(/[^a-z]/g, "");
  if (latin.length >= 6) {
    const vowels = latin.replace(/[^aeiou]/g, "").length / latin.length;
    if (vowels < 0.12) return true; // "sdfghjkl qwrtzp"
  }
  // Mostly keyboard-row runs: "asdf jkl qwerty zxcv"
  const words = t.split(/[^a-z]+/).filter((w) => w.length >= 3);
  if (words.length) {
    // Contiguous runs only ("asdf", "qwerty"); real words like "tree" use one row's letters but not in order.
    const mash = words.filter((w) => KEYBOARD_ROWS.some((row) => row.includes(w)));
    if (mash.length / words.length >= 0.6) return true;
  }
  return false;
}

/** Profile photo: a small resized data URL from the browser, or a YouTube avatar URL. Anything else is dropped. */
export function cleanAvatar(v: unknown): string {
  if (typeof v !== "string") return "";
  if (/^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= 14000) return v;
  if (/^https:\/\/yt3\.(ggpht|googleusercontent)\.com\/[\w\-./=?&%]+$/.test(v) && v.length <= 400) return v;
  return "";
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Total reach across platforms → price tier. Sum of range midpoints (people overlap; it's a rough signal). */
export function audienceTier(platforms: PlatformPresence[], expertOnly: boolean): AudienceTier {
  if (expertOnly || platforms.length === 0) return "starting";
  const total = platforms.reduce((s, p) => s + FOLLOWER_MID[p.followers], 0);
  if (total < 1500) return "starting";
  if (total < 5000) return "micro";
  if (total < 20000) return "small";
  if (total < 100000) return "mid";
  return "large";
}

const ALL_KEYWORDS = new Set(KEYWORD_GROUPS.flatMap((g) => g.keywords));

export type InputCheck =
  | { ok: true; input: CreatorInput }
  | { ok: false; reason: "empty" | "bad_handle" | "gibberish" | "thin"; message: string };

/**
 * Normalise the wizard payload and decide whether we have enough to work with.
 * We never trap a creator: "thin" input can always be forced.
 */
export function checkInput(body: Record<string, unknown>, force = false): InputCheck {
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");

  const rawPlatforms = Array.isArray(body.platforms) ? body.platforms.slice(0, PLATFORMS.length) : [];
  const platforms: PlatformPresence[] = [];
  for (const p of rawPlatforms as Record<string, unknown>[]) {
    if (!p || !PLATFORMS.includes(p.platform as Platform)) continue;
    if (platforms.some((x) => x.platform === p.platform)) continue;
    platforms.push({
      platform: p.platform as Platform,
      handle: cleanHandle(str(p.handle, 200)),
      followers: FOLLOWER_RANGES.includes(p.followers as FollowerRange) ? (p.followers as FollowerRange) : "1k-5k",
    });
  }
  const expertOnly = body.expertOnly === true;
  const earnings = (Array.isArray(body.earnings) ? body.earnings : []).filter((e): e is Earning => EARNINGS.includes(e as Earning));
  const keywords = (Array.isArray(body.keywords) ? body.keywords : [])
    .filter((k): k is string => typeof k === "string")
    .map((k) => k.trim().slice(0, LIMITS.customKeyword))
    .filter((k) => k && (ALL_KEYWORDS.has(k) || !looksLikeGibberish(k)))
    .slice(0, LIMITS.keywords);
  const description = str(body.description, LIMITS.description);
  const language: Language = LANGUAGES.includes(body.language as Language) ? (body.language as Language) : "english";

  const d = body.direction as Partial<Direction> | null | undefined;
  const direction: Direction | null =
    d && typeof d.title === "string" && d.title.trim()
      ? {
          title: str(d.title, 120),
          whyYou: str(d.whyYou, 300),
          buyers: str(d.buyers, 200),
          productIdeas: Array.isArray(d.productIdeas) ? d.productIdeas.slice(0, 4).map((x) => str(x, 80)) : [],
          emoji: str(d.emoji, 8),
        }
      : null;

  const ig = platforms.find((p) => p.platform === "instagram");
  // Only a valid Instagram username becomes the public @handle (it's linked to instagram.com).
  const primary = ig?.handle && isValidInstagramHandle(ig.handle) ? ig.handle : "";
  const anyHandle = primary || platforms.find((p) => p.handle)?.handle || "";

  const name = str(body.name, 40).replace(/\s+/g, " ");
  const whatsapp = String(body.whatsapp || "").replace(/\D/g, "").slice(-10);
  const avatar = cleanAvatar(body.avatar);
  const profileNote = str(body.profileNote, 700);

  const input: CreatorInput = {
    name,
    whatsapp: /^[6-9]\d{9}$/.test(whatsapp) ? whatsapp : "",
    avatar,
    profileNote,
    platforms,
    expertOnly,
    earnings,
    keywords,
    description,
    language,
    audience: audienceTier(platforms, expertOnly),
    handle: primary,
    niche: direction?.title || "",
    direction,
  };

  if (ig?.handle && !isValidInstagramHandle(ig.handle)) {
    return {
      ok: false,
      reason: "bad_handle",
      message: "That doesn't look like an Instagram username. Use letters, numbers, dots or underscores, e.g. @fitwithpriya.",
    };
  }
  if (!keywords.length && !description && !direction && !anyHandle && !profileNote) {
    return { ok: false, reason: "empty", message: "Pick a few topics you post about, or tell us in a line." };
  }
  if (force || direction) return { ok: true, input };

  if (description && looksLikeGibberish(description) && !keywords.length) {
    return { ok: false, reason: "gibberish", message: "We couldn't make sense of that. Pick a few topics above, or tell us in plain words what you post about." };
  }
  if (!keywords.length && wordCount(description) < 4 && !anyHandle) {
    return { ok: false, reason: "thin", message: "Give us a little more: pick a topic or two, or add a line about what you post." };
  }
  return { ok: true, input };
}
