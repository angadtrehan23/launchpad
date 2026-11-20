// ---------- Product formats (named the way SuperProfile names its product types) ----------
export const FORMATS = [
  "ebook",
  "template_pack",
  "recorded_course",
  "cohort_course",
  "one_on_one",
  "community",
  "workshop",
] as const;
export type ProductFormat = (typeof FORMATS)[number];

export const FORMAT_LABEL: Record<ProductFormat, string> = {
  ebook: "Digital product · Guide",
  template_pack: "Digital product · Templates",
  recorded_course: "Online course",
  cohort_course: "Live cohort course",
  one_on_one: "1:1 session",
  community: "Paid community",
  workshop: "Webinar / workshop",
};

/** Products a creator can deliver without making anything first → "Request a slot". */
export const BOOKABLE: ProductFormat[] = ["one_on_one", "workshop"];

// ---------- Where the creator creates ----------
export const PLATFORMS = [
  "instagram",
  "youtube",
  "linkedin",
  "facebook",
  "x",
  "snapchat",
  "moj",
  "telegram",
  "podcast",
  "blog",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_META: Record<Platform, { label: string; icon: string; placeholder: string }> = {
  instagram: { label: "Instagram", icon: "📸", placeholder: "@yourname" },
  youtube: { label: "YouTube", icon: "▶️", placeholder: "@channel" },
  linkedin: { label: "LinkedIn", icon: "💼", placeholder: "linkedin.com/in/you" },
  facebook: { label: "Facebook", icon: "👥", placeholder: "Page name" },
  x: { label: "X / Twitter", icon: "✖️", placeholder: "@handle" },
  snapchat: { label: "Snapchat", icon: "👻", placeholder: "@username" },
  moj: { label: "Moj / Josh / ShareChat", icon: "🎬", placeholder: "@handle" },
  telegram: { label: "Telegram channel", icon: "✈️", placeholder: "t.me/channel" },
  podcast: { label: "Podcast", icon: "🎙️", placeholder: "Show name" },
  blog: { label: "Blog / Newsletter", icon: "✍️", placeholder: "Site or newsletter" },
};

export const FOLLOWER_RANGES = ["lt1k", "1k-5k", "5k-20k", "20k-100k", "100k-1m", "1m+"] as const;
export type FollowerRange = (typeof FOLLOWER_RANGES)[number];
export const FOLLOWER_LABEL: Record<FollowerRange, string> = {
  lt1k: "Under 1K",
  "1k-5k": "1K–5K",
  "5k-20k": "5K–20K",
  "20k-100k": "20K–1L",
  "100k-1m": "1L–10L",
  "1m+": "10L+",
};
export const FOLLOWER_MID: Record<FollowerRange, number> = {
  lt1k: 500,
  "1k-5k": 3000,
  "5k-20k": 12000,
  "20k-100k": 50000,
  "100k-1m": 300000,
  "1m+": 1500000,
};

export interface PlatformPresence {
  platform: Platform;
  handle: string;
  followers: FollowerRange;
}

export const EARNINGS = ["brand_deals", "platform_payouts", "affiliate", "selling_already", "not_yet"] as const;
export type Earning = (typeof EARNINGS)[number];
export const EARNING_LABEL: Record<Earning, string> = {
  brand_deals: "Brand collabs",
  platform_payouts: "Platform payouts (YouTube, Reels)",
  affiliate: "Affiliate links",
  selling_already: "Already selling (courses, calls…)",
  not_yet: "Not earning yet",
};

/** Topic keywords we offer, grouped so a creator can tap instead of type. */
export const KEYWORD_GROUPS: { group: string; keywords: string[] }[] = [
  { group: "Health & body", keywords: ["Home workouts", "Gym", "Yoga", "Weight loss", "Diet & nutrition", "PCOS", "Running", "Mental wellness"] },
  { group: "Food", keywords: ["Home cooking", "Healthy recipes", "Baking", "Street food", "Tiffin & meal prep", "Regional cuisine"] },
  { group: "Beauty & style", keywords: ["Makeup", "Skincare", "Haircare", "Fashion", "Budget styling", "Nail art"] },
  { group: "Money & career", keywords: ["Personal finance", "Stock market", "Taxes", "Career growth", "Interview prep", "Freelancing", "Side hustles"] },
  { group: "Learning", keywords: ["Exam prep", "UPSC", "JEE / NEET", "Spoken English", "Coding", "Excel & data", "Kids education"] },
  { group: "Creative", keywords: ["Design", "Canva", "Video editing", "Photography", "Music", "Dance", "Art & craft"] },
  { group: "Life", keywords: ["Astrology", "Tarot", "Parenting", "Relationships", "Travel", "Productivity", "Spirituality"] },
  { group: "Business & tech", keywords: ["Marketing", "Instagram growth", "Small business", "AI tools", "Tech reviews", "Real estate"] },
];

// ---------- Price tiers ----------
export const AUDIENCE_TIERS = ["starting", "micro", "small", "mid", "large"] as const;
export type AudienceTier = (typeof AUDIENCE_TIERS)[number];
export const AUDIENCE_LABEL: Record<AudienceTier, string> = {
  starting: "Just starting",
  micro: "Under 5K",
  small: "5K–20K",
  mid: "20K–1L",
  large: "1L+",
};

export const LANGUAGES = ["english", "hinglish"] as const;
export type Language = (typeof LANGUAGES)[number];

export const THEMES = ["candy", "acid", "sunset", "ocean", "forest", "noir"] as const;
export type Theme = (typeof THEMES)[number];

// ---------- AI outputs ----------
export interface Direction {
  title: string; // the niche angle, e.g. "15-minute home workouts for working women"
  whyYou: string; // why it fits this creator
  buyers: string; // who would pay
  productIdeas: string[]; // 2–3 short examples
  emoji: string;
}

/** Launch-plan steps may only point at features SuperProfile actually has. */
export const SP_FEATURES = ["store", "lead_magnet", "auto_dm", "digital_product", "course", "webinar", "booking", "community", "email", "none"] as const;
export type SpFeature = (typeof SP_FEATURES)[number];
export const SP_FEATURE_LABEL: Record<SpFeature, string> = {
  store: "Link-in-bio store",
  lead_magnet: "Lead magnet / waitlist",
  auto_dm: "Instagram Auto-DM",
  digital_product: "Digital product",
  course: "Online course",
  webinar: "Webinar / event",
  booking: "1:1 booking",
  community: "Paid Telegram community",
  email: "Email to your list",
  none: "",
};

export interface PlanStep {
  when: string; // "Day 1", "Week 2"
  action: string;
  feature: SpFeature;
}

export interface Product {
  title: string;
  format: ProductFormat;
  priceInr: number;
  priceRationale: string;
  description: string;
  highlights: string[];
  ctaLabel: string;
}

export interface Creator {
  displayName: string;
  handle: string; // primary handle without @, may be empty
  tagline: string;
  bio: string;
  niche: string;
}

export interface Storefront {
  creator: Creator;
  products: Product[];
  plan: PlanStep[];
  theme: Theme;
  language: Language;
}

/** Everything the creator told us. Kept with the store so regeneration stays grounded. */
export interface CreatorInput {
  platforms: PlatformPresence[];
  expertOnly: boolean; // not on social yet
  earnings: Earning[];
  keywords: string[];
  description: string;
  language: Language;
  audience: AudienceTier; // derived from platforms
  handle: string; // derived: primary handle
  niche: string; // the chosen direction
  direction: Direction | null;
}

export interface WaitlistEntry {
  index: number;
  name: string;
  phone: string;
  at: string;
}

export interface FunnelMetrics {
  sessionStartedAt: string | null; // when the creator opened the wizard (client clock)
  generatedAt: string;
  generationMs: number;
  directionsShown: number;
  edits: Record<string, number>; // field → count, the "edit depth" diagnostic
  regens: Record<string, number>;
}

export interface StoreRecord {
  id: string;
  slug: string;
  editToken: string;
  input: CreatorInput;
  draft: Storefront;
  published: Storefront | null;
  source: "ai" | "starter";
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  metrics: FunnelMetrics;
}

export interface StoreStats {
  views: number;
  clicks: number[];
  waitlist: number[];
}

export type RegenTarget = "profile" | `product:${number}` | "all" | "plan";
