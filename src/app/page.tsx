"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listSaved, rememberStore, setFlash, type SavedStore } from "@/lib/local";
import {
  EARNING_LABEL,
  EARNINGS,
  FOLLOWER_LABEL,
  FOLLOWER_RANGES,
  KEYWORD_GROUPS,
  PLATFORM_META,
  PLATFORMS,
  type Direction,
  type Earning,
  type Language,
  type Platform,
  type PlatformPresence,
} from "@/lib/types";

type Step = "intro" | "platforms" | "earnings" | "topics" | "directions" | "building";
const FLOW: Step[] = ["platforms", "earnings", "topics", "directions"];
const MAX_KEYWORDS = 6;
const WIZARD_KEY = "sf:wizard";

interface Wizard {
  platforms: PlatformPresence[];
  expertOnly: boolean;
  earnings: Earning[];
  keywords: string[];
  description: string;
  language: Language;
  sessionStartedAt: string | null;
}
const EMPTY: Wizard = { platforms: [], expertOnly: false, earnings: [], keywords: [], description: "", language: "english", sessionStartedAt: null };

const EXAMPLES: { label: string; w: Partial<Wizard> }[] = [
  {
    label: "💪 Fitness creator, 18K on Instagram",
    w: { platforms: [{ platform: "instagram", handle: "fitwithpriya", followers: "5k-20k" }, { platform: "youtube", handle: "", followers: "1k-5k" }], earnings: ["brand_deals"], keywords: ["Home workouts", "Diet & nutrition", "PCOS"], description: "Quick workouts for working women", language: "english" },
  },
  {
    label: "📐 Maths teacher, not on social yet",
    w: { expertOnly: true, earnings: ["not_yet"], keywords: ["JEE / NEET", "Exam prep"], description: "I teach calculus in Kota, 9 years experience", language: "english" },
  },
  {
    label: "🍳 Home cook, Hinglish reels",
    w: { platforms: [{ platform: "instagram", handle: "tiffinwithmaa", followers: "20k-100k" }], earnings: ["affiliate"], keywords: ["Home cooking", "Tiffin & meal prep", "Regional cuisine"], description: "", language: "hinglish" },
  },
];

const BUILD_STEPS = ["Reading your direction", "Picking products your followers would buy", "Pricing them in ₹ for your audience", "Writing your page and launch plan"];

export default function Home() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [w, setW] = useState<Wizard>(EMPTY);
  const [ask, setAsk] = useState<{ message: string; canForce: boolean } | null>(null);
  const [error, setError] = useState("");
  const [directions, setDirections] = useState<Direction[]>([]);
  const [shownCount, setShownCount] = useState(0);
  const [dirSource, setDirSource] = useState<"ai" | "starter">("ai");
  const [loadingDirs, setLoadingDirs] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [ownNiche, setOwnNiche] = useState("");
  const [showOwn, setShowOwn] = useState(false);
  const [customKw, setCustomKw] = useState("");
  const [buildStep, setBuildStep] = useState(0);
  const [slow, setSlow] = useState(false);
  const [saved, setSaved] = useState<SavedStore[]>([]);
  const topRef = useRef<HTMLDivElement>(null);
  const dirsKey = useRef("");

  // Restore an unfinished wizard (refresh / back) and saved stores. Browser-only data, so after mount.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(WIZARD_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setW({ ...EMPTY, ...JSON.parse(raw) });
    } catch {}
    setSaved(listSaved());
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(WIZARD_KEY, JSON.stringify(w));
    } catch {}
  }, [w]);

  useEffect(() => {
    if (step !== "building") return;
    const t = setInterval(() => setBuildStep((s) => Math.min(s + 1, BUILD_STEPS.length - 1)), 3500);
    const s = setTimeout(() => setSlow(true), 25000);
    return () => {
      clearInterval(t);
      clearTimeout(s);
    };
  }, [step]);

  const go = (s: Step) => {
    setStep(s);
    setAsk(null);
    setError("");
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  const update = (patch: Partial<Wizard>) => setW((x) => ({ ...x, ...patch }));
  const start = () => {
    if (!w.sessionStartedAt) {
      update({ sessionStartedAt: new Date().toISOString() });
      // Anonymous funnel count: the denominator for "share of starters who publish".
      try {
        navigator.sendBeacon?.("/api/track", new Blob([JSON.stringify({ kind: "funnel", event: "wizard_started" })], { type: "application/json" }));
      } catch {}
    }
    go("platforms");
  };

  // ---------- helpers ----------
  const hasPlatform = (p: Platform) => w.platforms.some((x) => x.platform === p);
  const togglePlatform = (p: Platform) =>
    update({
      expertOnly: false,
      platforms: hasPlatform(p) ? w.platforms.filter((x) => x.platform !== p) : [...w.platforms, { platform: p, handle: "", followers: "1k-5k" }],
    });
  const setPresence = (p: Platform, patch: Partial<PlatformPresence>) =>
    update({ platforms: w.platforms.map((x) => (x.platform === p ? { ...x, ...patch } : x)) });

  const toggleEarning = (e: Earning) => {
    if (e === "not_yet") return update({ earnings: w.earnings.includes("not_yet") ? [] : ["not_yet"] });
    const rest = w.earnings.filter((x) => x !== "not_yet");
    update({ earnings: rest.includes(e) ? rest.filter((x) => x !== e) : [...rest, e] });
  };
  const toggleKeyword = (k: string) => {
    if (w.keywords.includes(k)) return update({ keywords: w.keywords.filter((x) => x !== k) });
    if (w.keywords.length >= MAX_KEYWORDS) return;
    update({ keywords: [...w.keywords, k] });
  };
  const addCustom = () => {
    const k = customKw.trim().slice(0, 30);
    if (!k || w.keywords.length >= MAX_KEYWORDS || w.keywords.some((x) => x.toLowerCase() === k.toLowerCase())) return;
    update({ keywords: [...w.keywords, k] });
    setCustomKw("");
  };

  const igBad = (() => {
    const h = w.platforms.find((p) => p.platform === "instagram")?.handle.replace(/^@/, "").trim();
    return !!h && !/instagram\.com/i.test(h) && !/^(?!.*\.\.)(?!\.)(?!.*\.$)[a-zA-Z0-9._]{1,30}$/.test(h);
  })();
  const canNext: Record<string, boolean> = {
    platforms: (w.platforms.length > 0 || w.expertOnly) && !igBad,
    earnings: w.earnings.length > 0,
    topics: w.keywords.length > 0 || w.description.trim().split(/\s+/).filter(Boolean).length >= 4,
  };

  // ---------- AI calls ----------
  async function fetchDirections(avoid: string[] = [], force = false) {
    // Same answers as last time (e.g. Back then Next): reuse the directions, don't spend another AI call.
    const key = JSON.stringify([w.platforms, w.expertOnly, w.earnings, w.keywords, w.description, w.language]);
    if (!avoid.length && !force && key === dirsKey.current && directions.length) {
      go("directions");
      return;
    }
    setLoadingDirs(true);
    setPicked(null);
    go("directions");
    try {
      const res = await fetch("/api/directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...w, avoid, force }),
      });
      const data = await res.json().catch(() => ({ status: "error" }));
      if (data.status === "ok") {
        dirsKey.current = key;
        setDirections(data.directions);
        setDirSource(data.source);
        setShownCount((n) => n + data.directions.length);
      } else if (data.status === "needs_more") {
        setStep("topics");
        setAsk({ message: data.message, canForce: !!data.canForce });
      } else {
        setError(data.message || "Something went wrong on our side. Your answers are saved, so just try again.");
      }
    } catch {
      setError("Your connection dropped. Your answers are saved, so just try again.");
    } finally {
      setLoadingDirs(false);
    }
  }

  async function build(direction: Direction) {
    setBuildStep(0);
    setSlow(false);
    setStep("building");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 70000);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...w, direction, directionsShown: shownCount }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({ status: "error" }));
      if (data.status === "ok") {
        const handle = w.platforms.find((p) => p.platform === "instagram")?.handle || w.platforms.find((p) => p.handle)?.handle;
        rememberStore({ id: data.id, token: data.editToken, name: handle ? `@${handle.replace(/^@/, "")}` : direction.title, at: Date.now() });
        setFlash(data.id, { assumption: data.assumption, notice: data.notice });
        try {
          sessionStorage.removeItem(WIZARD_KEY);
        } catch {}
        router.push(`/studio/${data.id}#k=${data.editToken}`);
        return;
      }
      setStep("directions");
      setError(data.message || "Something went wrong on our side. Your answers are saved, so just try again.");
    } catch {
      setStep("directions");
      setError("That took too long or your connection dropped. Your answers are saved, so just try again.");
    } finally {
      clearTimeout(timer);
    }
  }

  const chip = (active: boolean) =>
    `rounded-full border-2 px-3.5 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-40 ${active ? "border-ink bg-lime text-ink brut-sm" : "border-ink/20 bg-white text-ink"}`;
  const tile = (active: boolean) =>
    `rounded-2xl border-2 text-left text-sm font-bold transition press ${active ? "border-ink bg-lime text-ink brut" : "border-ink/20 bg-white"}`;
  const stepIndex = FLOW.indexOf(step);
  const custom = w.keywords.filter((k) => !KEYWORD_GROUPS.some((g) => g.keywords.includes(k)));

  // ---------- building screen ----------
  if (step === "building") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper dotted px-6">
        <div className="w-full max-w-sm rounded-3xl bg-white p-7 brut">
          <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-ink/15 border-t-violet" />
          <h2 className="text-center font-display text-2xl font-extrabold">Cooking up your store 🍳</h2>
          <ul className="mt-6 space-y-3">
            {BUILD_STEPS.map((s, i) => (
              <li key={s} className={`flex items-center gap-3 text-sm transition-opacity ${i <= buildStep ? "opacity-100" : "opacity-35"}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i < buildStep ? "bg-lime text-ink" : i === buildStep ? "bg-violet text-white" : "bg-neutral-200"}`}>
                  {i < buildStep ? "✓" : i + 1}
                </span>
                {s}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-xs text-neutral-500">{slow ? "Taking a little longer than usual. Almost there." : "Usually takes 15–30 seconds."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-paper dotted">
      <div ref={topRef} className="mx-auto w-full max-w-md px-4 pb-32 pt-5">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet text-lime brut-sm">✦</span>
            Launchpad
            <span className="rounded-full border-2 border-ink bg-lime px-2 py-0.5 text-[10px] font-bold text-ink">concept for SuperProfile</span>
          </div>
          {step !== "intro" && (
            <button onClick={() => go(stepIndex <= 0 ? "intro" : FLOW[stepIndex - 1])} className="text-sm font-semibold text-neutral-500">
              ← Back
            </button>
          )}
        </header>

        {step !== "intro" && (
          <div className="mt-4 flex gap-1.5" aria-label={`Step ${stepIndex + 1} of ${FLOW.length}`}>
            {FLOW.map((s, i) => (
              <div key={s} className={`h-2.5 flex-1 rounded-full border-2 border-ink ${i <= stepIndex ? "bg-violet" : "bg-white"}`} />
            ))}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        {ask && (
          <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" role="status">
            <p>{ask.message}</p>
            {ask.canForce && (
              <button type="button" onClick={() => fetchDirections([], true)} className="mt-2 font-semibold underline underline-offset-2">
                Skip, suggest ideas with what I gave →
              </button>
            )}
          </div>
        )}

        {/* INTRO */}
        {step === "intro" && (
          <section>
            <h1 className="mt-8 font-display text-[38px] font-extrabold leading-[1.02]">
              You have the audience.
              <br />
              <span className="box-decoration-clone rounded-lg bg-lime px-1.5">We&apos;ll figure out</span>{" "}
              <span className="text-violet">what to sell.</span>
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-neutral-600">
              Answer 3 quick questions by tapping. AI suggests what you could sell, prices it in ₹, writes your store and gives you a 2-week launch plan. You review it, then share one link.
            </p>
            <div className="-mx-4 mt-6 overflow-hidden border-y-2 border-ink bg-pink py-2">
              <div className="marquee flex w-max gap-6 whitespace-nowrap font-display text-sm font-bold">
                {[0, 1].map((k) => (
                  <span key={k} className="flex gap-6">
                    {["🧘 yoga teachers", "💄 makeup artists", "📈 finance creators", "🍳 home cooks", "📚 JEE mentors", "🔮 astrologers", "🎨 designers", "💪 fitness coaches"].map((t) => (
                      <span key={t}>{t} ✦</span>
                    ))}
                  </span>
                ))}
              </div>
            </div>
            <ol className="mt-6 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-ink">
              {[
                ["👆", "Tap 3 answers"],
                ["🧭", "Pick a direction"],
                ["🛍️", "Get your store"],
              ].map(([i, t]) => (
                <li key={t} className="rounded-2xl bg-white p-3 brut-sm">
                  <div className="text-xl">{i}</div>
                  <div className="mt-1">{t}</div>
                </li>
              ))}
            </ol>
            <button onClick={start} className="mt-7 w-full rounded-2xl bg-violet py-4 font-display text-lg font-extrabold text-white brut press">
              Let&apos;s build my store →
            </button>
            <p className="mt-2 text-center text-xs text-neutral-500">About 2 minutes. No login, no card.</p>

            <div className="mt-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Or try an example</p>
              <div className="mt-2 flex flex-col gap-2">
                {EXAMPLES.map((e) => (
                  <button
                    key={e.label}
                    onClick={() => {
                      setW({ ...EMPTY, ...e.w, sessionStartedAt: new Date().toISOString() });
                      go("platforms");
                    }}
                    className="rounded-xl border-2 border-dashed border-ink/40 bg-white px-3 py-2.5 text-left text-sm font-medium text-ink press"
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>

            {saved.length > 0 && (
              <div className="mt-6 rounded-2xl bg-white p-3 brut-sm">
                <p className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Continue editing</p>
                {saved.slice(0, 3).map((s) => (
                  <button key={s.id} onClick={() => router.push(`/studio/${s.id}#k=${s.token}`)} className="mt-1 flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-sm font-medium hover:bg-neutral-50">
                    {s.name} <span className="text-neutral-400">→</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* STEP 1: PLATFORMS */}
        {step === "platforms" && (
          <section>
            <h2 className="mt-6 font-display text-[28px] font-extrabold leading-tight">Where do you create?</h2>
            <p className="mt-1 text-sm text-neutral-600">Pick every place you post. Your total audience sets fair prices.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {PLATFORMS.map((p) => (
                <button key={p} onClick={() => togglePlatform(p)} className={`flex items-center gap-2 px-3 py-3 ${tile(hasPlatform(p))}`}>
                  <span className="text-lg">{PLATFORM_META[p].icon}</span>
                  {PLATFORM_META[p].label}
                </button>
              ))}
            </div>
            <button onClick={() => update({ expertOnly: !w.expertOnly, platforms: [] })} className={`mt-2 w-full px-3 py-3 ${tile(w.expertOnly)}`}>
              🎓 I&apos;m not on social yet. I&apos;m a teacher, coach or professional
            </button>

            {w.platforms.length > 0 && (
              <div className="mt-6 space-y-3">
                {w.platforms.map((p) => (
                  <div key={p.platform} className="rounded-2xl bg-white p-4 brut-sm">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      {PLATFORM_META[p.platform].icon} {PLATFORM_META[p.platform].label}
                    </div>
                    <input
                      value={p.handle}
                      onChange={(e) => setPresence(p.platform, { handle: e.target.value })}
                      placeholder={`${PLATFORM_META[p.platform].placeholder} (optional)`}
                      autoCapitalize="none"
                      autoCorrect="off"
                      className="mt-2 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-base outline-none focus:border-violet focus:bg-white"
                    />
                    {p.platform === "instagram" && igBad && <p className="mt-1 text-xs text-red-600">Usernames use letters, numbers, dots and underscores, like @fitwithpriya.</p>}
                    <p className="mt-3 text-xs font-semibold text-neutral-500">Followers</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {FOLLOWER_RANGES.map((f) => (
                        <button key={f} onClick={() => setPresence(p.platform, { followers: f })} className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold ${p.followers === f ? "border-ink bg-violet text-white" : "border-ink/20 bg-white text-ink"}`}>
                          {FOLLOWER_LABEL[f]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-neutral-500">We don&apos;t log in to or scrape your accounts. Usernames are only used for your page and as a hint.</p>
              </div>
            )}
          </section>
        )}

        {/* STEP 2: EARNINGS */}
        {step === "earnings" && (
          <section>
            <h2 className="mt-6 font-display text-[28px] font-extrabold leading-tight">Do you earn from your content today?</h2>
            <p className="mt-1 text-sm text-neutral-600">Pick all that apply. It helps us pitch prices at the right level.</p>
            <div className="mt-5 flex flex-col gap-2">
              {EARNINGS.map((e) => (
                <button key={e} onClick={() => toggleEarning(e)} className={`px-4 py-3.5 ${tile(w.earnings.includes(e))}`}>
                  {w.earnings.includes(e) ? "✓ " : ""}
                  {EARNING_LABEL[e]}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* STEP 3: TOPICS */}
        {step === "topics" && (
          <section>
            <h2 className="mt-6 font-display text-[28px] font-extrabold leading-tight">What&apos;s your content about?</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Tap up to {MAX_KEYWORDS}. <span className="rounded-full border-2 border-ink bg-pink px-2 py-0.5 text-xs font-bold text-ink">{w.keywords.length}/{MAX_KEYWORDS} picked</span>
            </p>
            <div className="mt-4 space-y-4">
              {KEYWORD_GROUPS.map((g) => (
                <div key={g.group}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{g.group}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {g.keywords.map((k) => (
                      <button key={k} onClick={() => toggleKeyword(k)} className={chip(w.keywords.includes(k))} disabled={!w.keywords.includes(k) && w.keywords.length >= MAX_KEYWORDS}>
                        {k}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {custom.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {custom.map((k) => (
                  <button key={k} onClick={() => toggleKeyword(k)} className={chip(true)}>
                    {k} ✕
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <input
                value={customKw}
                onChange={(e) => setCustomKw(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                placeholder="Not listed? Add your own"
                maxLength={30}
                className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-base outline-none focus:border-violet"
              />
              <button onClick={addCustom} className="rounded-xl bg-ink px-4 text-sm font-bold text-lime press">
                Add
              </button>
            </div>
            <label className="mt-5 block">
              <span className="text-sm font-semibold">
                In your own words <span className="font-normal text-neutral-500">(optional, any language)</span>
              </span>
              <textarea value={w.description} onChange={(e) => update({ description: e.target.value })} rows={2} maxLength={600} placeholder="e.g. Quick veg tiffin ideas for working moms in Pune" className="mt-1.5 w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-3 text-base outline-none focus:border-violet" />
            </label>
            <div className="mt-4">
              <span className="text-sm font-semibold">Your store&apos;s language</span>
              <div className="mt-2 grid grid-cols-2 rounded-xl bg-neutral-100 p-1">
                {(["english", "hinglish"] as Language[]).map((l) => (
                  <button key={l} onClick={() => update({ language: l })} className={`rounded-lg py-2 text-sm font-semibold ${w.language === l ? "bg-white shadow" : "text-neutral-500"}`}>
                    {l === "english" ? "English" : "Hinglish"}
                  </button>
                ))}
              </div>
            </div>
                      <p className="mt-5 text-xs leading-relaxed text-neutral-500">
              🔒 Your answers go to an AI model to suggest ideas. We never send your followers&apos; details to it, and we don&apos;t log in to your accounts.
            </p>
          </section>
        )}

        {/* STEP 4: DIRECTIONS */}
        {step === "directions" && (
          <section>
            <h2 className="mt-6 font-display text-[28px] font-extrabold leading-tight">{loadingDirs ? "Figuring it out for you…" : "Here's what you could sell"}</h2>
            <p className="mt-1 text-sm text-neutral-600">
              {loadingDirs ? "Matching your topics, audience and platforms to what Indian buyers pay for." : "Pick the direction that feels most like you. We'll build your store around it."}
            </p>

            {loadingDirs ? (
              <div className="mt-5 space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-36 animate-pulse rounded-2xl bg-white brut-sm" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            ) : (
              <>
                {dirSource === "starter" && directions.length > 0 && (
                  <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                    Our AI is busy, so these are simple starting points from your topics. Tap &ldquo;Show me 3 different ones&rdquo; to try the AI again.
                  </p>
                )}
                <div className="mt-5 space-y-3">
                  {directions.map((d, i) => (
                    <button key={d.title + i} onClick={() => setPicked(i)} className={`block w-full rounded-2xl border-2 p-4 text-left transition press ${picked === i ? "border-ink bg-lime brut" : "border-ink/20 bg-white"}`}>
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{d.emoji}</span>
                        <div className="flex-1">
                          <p className="text-base font-bold leading-snug">{d.title}</p>
                          <p className="mt-1 text-sm text-neutral-600">{d.whyYou}</p>
                          <p className="mt-2 text-xs text-neutral-500">
                            <b className="text-neutral-700">Who pays:</b> {d.buyers}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {d.productIdeas.map((x) => (
                              <span key={x} className="rounded-full border border-ink/20 bg-white px-2 py-0.5 text-[11px] font-semibold text-ink">
                                {x}
                              </span>
                            ))}
                          </div>
                        </div>
                        <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${picked === i ? "border-ink bg-ink text-[10px] text-lime" : "border-ink/30"}`}>{picked === i ? "✓" : ""}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  <button onClick={() => fetchDirections(directions.map((d) => d.title))} className="rounded-xl border-2 border-ink bg-white py-3 text-sm font-bold brut-sm press">
                    ↻ Show me 3 different ones
                  </button>
                  {showOwn ? (
                    <div className="flex gap-2">
                      <input value={ownNiche} onChange={(e) => setOwnNiche(e.target.value)} maxLength={80} placeholder="e.g. Saree draping for working women" className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-base outline-none focus:border-violet" />
                      <button disabled={ownNiche.trim().length < 4} onClick={() => build({ title: ownNiche.trim(), whyYou: "", buyers: "", productIdeas: [], emoji: "✍️" })} className="rounded-xl bg-neutral-900 px-4 text-sm font-bold text-white disabled:opacity-40">
                        Use
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setShowOwn(true)} className="text-sm font-bold text-violet underline underline-offset-4">
                      I already know my niche. Let me type it
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {/* Sticky action */}
      {step !== "intro" && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-paper/95 backdrop-blur">
          <div className="mx-auto max-w-md px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {step === "directions" ? (
              <button disabled={picked === null || loadingDirs} onClick={() => picked !== null && build(directions[picked])} className="w-full rounded-2xl bg-violet py-4 font-display text-lg font-extrabold text-white brut press disabled:bg-neutral-300 disabled:text-neutral-500 disabled:shadow-none">
                {picked === null ? "Pick a direction" : "Build my store with this ✨"}
              </button>
            ) : (
              <button disabled={!canNext[step]} onClick={() => (step === "topics" ? fetchDirections() : go(FLOW[stepIndex + 1]))} className="w-full rounded-2xl bg-ink py-4 font-display text-lg font-extrabold text-lime brut press disabled:border-neutral-300 disabled:bg-neutral-300 disabled:text-neutral-500 disabled:shadow-none">
                {step === "topics" ? "Figure out what I can sell ✨" : "Next →"}
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
