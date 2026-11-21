"use client";

import { useEffect, useRef, useState } from "react";
import Thinking from "@/components/Thinking";
import { askFromBrowser } from "@/lib/browserAi";
import { toAvatar } from "@/lib/image";
import TopNav from "@/components/TopNav";
import { useAccount } from "@/lib/useAccount";
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

type Step = "intro" | "about" | "platforms" | "earnings" | "topics" | "directions" | "building";
const FLOW: Step[] = ["about", "platforms", "earnings", "topics", "directions"];
const STEP_TITLE: Record<string, string> = { about: "About you", platforms: "Your channels", earnings: "Your earnings", topics: "Your content", directions: "Your direction" };
const MAX_KEYWORDS = 6;
const SAVE_BASE = "lp:wizard:v4";

interface Wizard {
  name: string;
  whatsapp: string;
  avatar: string;
  profileNote: string;
  ytFound: { title: string; description: string } | null;
  platforms: PlatformPresence[];
  expertOnly: boolean;
  earnings: Earning[];
  keywords: string[];
  description: string;
  language: Language;
  sessionStartedAt: string | null;
}
const EMPTY: Wizard = { name: "", whatsapp: "", avatar: "", profileNote: "", ytFound: null, platforms: [], expertOnly: false, earnings: [], keywords: [], description: "", language: "english", sessionStartedAt: null };

/** Everything needed to come back to the exact same screen after a refresh. */
interface Saved {
  w: Wizard;
  step: Step;
  directions: Direction[];
  dirSource: "ai" | "starter";
  picked: number | null;
  shownCount: number;
  dirsKey: string;
}

const DIRECTION_MESSAGES = ["Reading your topics and channels…", "Looking at what your audience size can support…", "Matching your skills to what Indian buyers pay for…", "Shaping three directions for you…"];
const BUILD_MESSAGES = ["Writing your bio…", "Picking products your followers would buy…", "Pricing them in ₹ for your audience…", "Writing descriptions…", "Laying out your page…"];


export default function Home() {
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
  const [buildNote, setBuildNote] = useState("");
  const [account] = useAccount();
  const [ytChecking, setYtChecking] = useState(false);
  const [photoNote, setPhotoNote] = useState("");
  const [restored, setRestored] = useState(false);
  const dirsKey = useRef("");
  const topRef = useRef<HTMLDivElement>(null);

  // ---- restore after refresh: answers are kept per account, so a shared phone never shows someone else's ----
  const SAVE_KEY = `${SAVE_BASE}:${account?.id || "guest"}`;
  useEffect(() => {
    if (account === undefined || restored) return;
    try {
      localStorage.removeItem("lp:wizard:v3"); // older, device-wide answers
      if (!account) localStorage.removeItem(SAVE_KEY);
      const raw = account ? localStorage.getItem(SAVE_KEY) : null;
      if (raw) {
        const s = JSON.parse(raw) as Saved;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setW({ ...EMPTY, ...s.w });
        setDirections(s.directions || []);
        setDirSource(s.dirSource || "ai");
        setPicked(s.picked ?? null);
        setShownCount(s.shownCount || 0);
        dirsKey.current = s.dirsKey || "";
        // A refresh mid-build comes back to the directions so the creator can tap Build again.
        setStep(s.step === "building" ? "directions" : s.step || "intro");
      }
    } catch {}
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);
  useEffect(() => {
    if (!restored) return;
    try {
      const s: Saved = { w, step, directions, dirSource, picked, shownCount, dirsKey: dirsKey.current };
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch {}
  }, [restored, w, step, directions, dirSource, picked, shownCount, SAVE_KEY]);

  const go = (s: Step) => {
    setStep(s);
    setAsk(null);
    setError("");
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  const update = (patch: Partial<Wizard>) => setW((x) => ({ ...x, ...patch }));
  const start = () => {
    if (!account) {
      window.location.assign(`/login?next=${encodeURIComponent("/?go=1")}`);
      return;
    }
    if (!w.name.trim()) update({ name: account.name });
    if (!w.sessionStartedAt) {
      update({ sessionStartedAt: new Date().toISOString() });
      try {
        navigator.sendBeacon?.("/api/track", new Blob([JSON.stringify({ kind: "funnel", event: "wizard_started" })], { type: "application/json" }));
      } catch {}
    }
    go("about");
  };

  // Building a store needs an account: logged-out visitors always start from the intro.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (restored && account === null && step !== "intro") setStep("intro");
  }, [restored, account, step]);

  // Back from login (or "Build a new store" in My stores): jump straight into step 1.
  useEffect(() => {
    if (!restored || !account) return;
    if (new URLSearchParams(window.location.search).get("go") !== "1") return;
    window.history.replaceState(null, "", "/");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (step === "intro") start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, account]);

  // ---- helpers ----
  const hasPlatform = (p: Platform) => w.platforms.some((x) => x.platform === p);
  const togglePlatform = (p: Platform) =>
    update({
      expertOnly: false,
      platforms: hasPlatform(p) ? w.platforms.filter((x) => x.platform !== p) : [...w.platforms, { platform: p, handle: "", followers: "1k-5k" }],
    });
  const setPresence = (p: Platform, patch: Partial<PlatformPresence>) => update({ platforms: w.platforms.map((x) => (x.platform === p ? { ...x, ...patch } : x)) });
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

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoNote("");
    const data = await toAvatar(file).catch(() => "");
    if (!data) return setPhotoNote("Couldn't use that photo. Try a different image.");
    update({ avatar: data });
  }

  /** Real profile signals: read the creator's public YouTube channel page. */
  async function readYouTube(handle: string) {
    const h = handle.trim();
    if (h.length < 3) return;
    setYtChecking(true);
    try {
      const r = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: h }) }).then((x) => x.json());
      if (r.found) {
        setW((x) => ({
          ...x,
          ytFound: { title: r.title, description: r.description },
          profileNote: x.profileNote || r.description,
          avatar: x.avatar || r.avatar || "",
        }));
      } else {
        setW((x) => ({ ...x, ytFound: null }));
      }
    } catch {
    } finally {
      setYtChecking(false);
    }
  }

  const igBad = (() => {
    const h = w.platforms.find((p) => p.platform === "instagram")?.handle.replace(/^@/, "").trim();
    return !!h && !/instagram\.com/i.test(h) && !/^(?!.*\.\.)(?!\.)(?!.*\.$)[a-zA-Z0-9._]{1,30}$/.test(h);
  })();
  const canNext: Record<string, boolean> = {
    about: w.name.trim().length >= 2,
    platforms: (w.platforms.length > 0 || w.expertOnly) && !igBad,
    earnings: w.earnings.length > 0,
    topics: w.keywords.length > 0 || w.description.trim().split(/\s+/).filter(Boolean).length >= 4,
  };
  const payload = () => {
    const { ytFound: _yt, ...rest } = w;
    void _yt;
    return rest;
  };

  // ---- AI calls ----
  async function fetchDirections(avoid: string[] = [], force = false) {
    // Same answers as last time (Back then Next, or a refresh): reuse the directions.
    const key = JSON.stringify([w.platforms, w.expertOnly, w.earnings, w.keywords, w.description, w.language, w.profileNote]);
    if (!avoid.length && !force && key === dirsKey.current && directions.length) {
      go("directions");
      return;
    }
    setLoadingDirs(true);
    setPicked(null);
    go("directions");
    try {
      const aiText = await askFromBrowser("directions", { ...payload(), avoid, force });
      const res = await fetch("/api/directions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload(), avoid, force, aiText }) });
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
    setBuildNote("");
    setStep("building");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 130000);
    const bail = setTimeout(() => {
      setStep("directions");
      setError("This took too long. Your answers are saved, so tap Build again.");
    }, 150000);
    try {
      const aiText = await askFromBrowser("store", { ...payload(), direction }, () => setBuildNote("Putting the finishing touches on your store. This can take up to a minute."));
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), direction, directionsShown: shownCount, aiText }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({ status: "error" }));
      if (data.status === "ok") {
        // Save to the creator's account, then open the editor.
        const draft = { ...data.draft, creator: { ...data.draft.creator, avatar: data.input.avatar } };
        const saved = await fetch("/api/stores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: data.input, draft, source: data.source, notes: { assumption: data.assumption, notice: data.notice } }),
        });
        const got = await saved.json().catch(() => ({}));
        if (saved.status === 401) {
          window.location.assign(`/login?mode=login&next=${encodeURIComponent("/?go=1")}`);
          return;
        }
        if (saved.ok && got.id) {
          try {
            localStorage.removeItem(SAVE_KEY);
          } catch {}
          window.location.assign(`/studio/${got.id}`);
          return;
        }
        setStep("directions");
        setError(got.error || "Your store was built but we couldn't save it. Tap Build again.");
        return;
      }
      setStep("directions");
      setError(data.message || "Something went wrong on our side. Your answers are saved, so just try again.");
    } catch {
      setStep("directions");
      setError("That took too long or your connection dropped. Your answers are saved, so just try again.");
    } finally {
      clearTimeout(timer);
      clearTimeout(bail);
    }
  }

  // ---- UI bits ----
  const chip = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-sm transition disabled:opacity-40 ${active ? "border-violet bg-violet text-white" : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"}`;
  const tile = (active: boolean) =>
    `rounded-xl border text-left text-sm font-medium transition ${active ? "border-violet bg-violet/5 text-ink ring-1 ring-violet" : "border-neutral-200 bg-white hover:border-neutral-300"}`;
  const input = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none focus:border-violet focus:ring-2 focus:ring-violet/20";
  const label = "text-sm font-medium text-ink";
  const stepIndex = FLOW.indexOf(step);
  const custom = w.keywords.filter((k) => !KEYWORD_GROUPS.some((g) => g.keywords.includes(k)));
  const ig = w.platforms.find((p) => p.platform === "instagram");

  if (step === "building") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#F7F7FB] px-4">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <Thinking title="Building your store" messages={BUILD_MESSAGES} note={buildNote || "Usually takes 15–40 seconds. Please keep this page open."} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#F7F7FB]">
      <TopNav
        right={
          account ? (
            <a href="/dashboard" className="px-2 py-1.5 font-medium text-neutral-600 hover:text-ink">My stores</a>
          ) : account === null ? (
            <a href="/login?mode=login" className="px-2 py-1.5 font-medium text-neutral-600 hover:text-ink">Log in</a>
          ) : null
        }
      />
      <div ref={topRef} className="mx-auto w-full max-w-lg px-4 pb-32 pt-2">
        {step !== "intro" && (
          <button onClick={() => go(stepIndex <= 0 ? "intro" : FLOW[stepIndex - 1])} className="mt-2 text-sm font-medium text-neutral-500 hover:text-ink">
            ← Back
          </button>
        )}

        {step !== "intro" && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs font-medium text-neutral-500">
              <span>
                Step {stepIndex + 1} of {FLOW.length} · {STEP_TITLE[step]}
              </span>
              <span>{Math.round(((stepIndex + 1) / FLOW.length) * 100)}%</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-neutral-200">
              <div className="h-1.5 rounded-full bg-violet transition-all" style={{ width: `${((stepIndex + 1) / FLOW.length) * 100}%` }} />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        {ask && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
            <p>{ask.message}</p>
            {ask.canForce && (
              <button type="button" onClick={() => fetchDirections([], true)} className="mt-2 font-semibold underline underline-offset-2">
                Continue with what I gave →
              </button>
            )}
          </div>
        )}

        {/* INTRO */}
        {step === "intro" && (
          <section className="mt-8">
            <p className="text-sm font-semibold text-violet">For creators, coaches and educators</p>
            <h1 className="mt-2 text-[32px] font-bold leading-tight tracking-tight text-ink">Turn your audience into your first store, in minutes.</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
              Answer a few questions about you and your content. We suggest what you could sell, price it in ₹ and build a store page you can share with one link.
            </p>
            <ol className="mt-8 space-y-3">
              {[
                ["Tell us about you", "Your name, channels, audience and topics."],
                ["Pick a direction", "Choose from three ideas tailored to you."],
                ["Review and publish", "Edit anything, then share your store link."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3 rounded-xl border border-neutral-200 bg-white p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet/10 text-sm font-semibold text-violet">{i + 1}</span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{t}</span>
                    <span className="block text-sm text-neutral-600">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
            <button onClick={start} className="mt-8 w-full rounded-xl bg-violet py-3.5 text-base font-semibold text-white shadow-sm hover:bg-violet/90">
              {w.sessionStartedAt ? "Continue where I left off →" : "Get started →"}
            </button>
            {account && (
              <a href="/dashboard" className="mt-3 block w-full rounded-xl border border-neutral-200 bg-white py-3 text-center text-sm font-semibold text-ink hover:bg-neutral-50">
                Open my stores
              </a>
            )}
            {account === null && (
              <p className="mt-3 text-center text-sm text-neutral-600">
                Already have an account?{" "}
                <a href="/login?mode=login" className="font-semibold text-violet">
                  Log in
                </a>
              </p>
            )}
          </section>
        )}

        {/* STEP 1: ABOUT YOU */}
        {step === "about" && (
          <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-ink">Let&apos;s start with you</h2>
            <p className="mt-1 text-sm text-neutral-600">This appears on your store page.</p>
            <div className="mt-5 flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet/10 text-xl font-semibold text-violet">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {w.avatar ? <img src={w.avatar} alt="" className="h-full w-full object-cover" /> : (w.name.trim()[0] || "?").toUpperCase()}
              </div>
              <div>
                <label className="cursor-pointer rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-ink hover:bg-neutral-50">
                  {w.avatar ? "Change photo" : "Upload photo"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
                </label>
                {w.avatar && (
                  <button onClick={() => update({ avatar: "" })} className="ml-2 text-sm text-neutral-500 hover:text-ink">
                    Remove
                  </button>
                )}
                <p className="mt-1.5 text-xs text-neutral-500">{photoNote || "Optional. A square photo of your face works best."}</p>
              </div>
            </div>
            <label className="mt-5 block">
              <span className={label}>Full name</span>
              <input value={w.name} onChange={(e) => update({ name: e.target.value })} maxLength={40} autoComplete="name" placeholder="e.g. Priya Sharma" className={`${input} mt-1.5`} />
            </label>
          </section>
        )}

        {/* STEP 2: PLATFORMS */}
        {step === "platforms" && (
          <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-ink">Where do you create content?</h2>
            <p className="mt-1 text-sm text-neutral-600">Select all that apply. Your audience size helps us set fair prices.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {PLATFORMS.map((p) => (
                <button key={p} onClick={() => togglePlatform(p)} className={`px-3 py-2.5 ${tile(hasPlatform(p))}`}>
                  {PLATFORM_META[p].label}
                </button>
              ))}
            </div>
            <button onClick={() => update({ expertOnly: !w.expertOnly, platforms: [] })} className={`mt-2 w-full px-3 py-2.5 ${tile(w.expertOnly)}`}>
              I&apos;m not on social media yet (teacher, coach or professional)
            </button>

            {w.platforms.map((p) => (
              <div key={p.platform} className="mt-4 rounded-xl border border-neutral-200 p-4">
                <p className="text-sm font-semibold text-ink">{PLATFORM_META[p.platform].label}</p>
                <input
                  value={p.handle}
                  onChange={(e) => setPresence(p.platform, { handle: e.target.value })}
                  onBlur={(e) => p.platform === "youtube" && readYouTube(e.target.value)}
                  placeholder={`${PLATFORM_META[p.platform].placeholder}`}
                  autoCapitalize="none"
                  autoCorrect="off"
                  className={`${input} mt-2`}
                />
                {p.platform === "instagram" && igBad && <p className="mt-1 text-xs text-red-600">Usernames use letters, numbers, dots and underscores.</p>}
                {p.platform === "youtube" && (ytChecking || w.ytFound) && (
                  <p className="mt-2 rounded-lg bg-violet/5 p-2.5 text-xs text-neutral-700">
                    {ytChecking ? "Reading your channel…" : `✓ Found "${w.ytFound?.title}". We'll use your channel description to match your real topics.`}
                  </p>
                )}
                <p className="mt-3 text-xs font-medium text-neutral-500">Followers</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {FOLLOWER_RANGES.map((f) => (
                    <button key={f} onClick={() => setPresence(p.platform, { followers: f })} className={`rounded-full border px-3 py-1 text-xs font-medium ${p.followers === f ? "border-violet bg-violet text-white" : "border-neutral-300 bg-white text-neutral-600"}`}>
                      {FOLLOWER_LABEL[f]}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {ig && (
              <label className="mt-4 block">
                <span className={label}>
                  Your Instagram bio and a recent caption <span className="font-normal text-neutral-500">(optional)</span>
                </span>
                <textarea value={w.profileNote} onChange={(e) => update({ profileNote: e.target.value })} rows={3} maxLength={700} placeholder="Paste your bio and 1–2 recent captions so the store sounds like you." className={`${input} mt-1.5 resize-none`} />
                <span className="mt-1 block text-xs text-neutral-500">Instagram doesn&apos;t let apps read profiles, so pasting is the most accurate way.</span>
              </label>
            )}
          </section>
        )}

        {/* STEP 3: EARNINGS */}
        {step === "earnings" && (
          <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-ink">Do you earn from your content today?</h2>
            <p className="mt-1 text-sm text-neutral-600">Select all that apply. This helps us pitch prices at the right level.</p>
            <div className="mt-5 flex flex-col gap-2">
              {EARNINGS.map((e) => (
                <button key={e} onClick={() => toggleEarning(e)} className={`flex items-center justify-between px-4 py-3 ${tile(w.earnings.includes(e))}`}>
                  {EARNING_LABEL[e]}
                  <span className={`flex h-5 w-5 items-center justify-center rounded border text-[11px] ${w.earnings.includes(e) ? "border-violet bg-violet text-white" : "border-neutral-300"}`}>{w.earnings.includes(e) ? "✓" : ""}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* STEP 4: TOPICS */}
        {step === "topics" && (
          <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-ink">What is your content about?</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Choose up to {MAX_KEYWORDS} topics · <span className="font-medium text-violet">{w.keywords.length} selected</span>
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
                placeholder="Add another topic"
                maxLength={30}
                className={`${input} min-w-0 flex-1`}
              />
              <button onClick={addCustom} className="rounded-lg border border-neutral-300 px-4 text-sm font-medium text-ink hover:bg-neutral-50">
                Add
              </button>
            </div>
            <label className="mt-5 block">
              <span className={label}>
                Describe your content in a line <span className="font-normal text-neutral-500">(optional)</span>
              </span>
              <textarea value={w.description} onChange={(e) => update({ description: e.target.value })} rows={2} maxLength={600} placeholder="e.g. Quick veg tiffin ideas for working parents in Pune" className={`${input} mt-1.5 resize-none`} />
            </label>
            <div className="mt-4">
              <span className={label}>Store language</span>
              <div className="mt-1.5 grid grid-cols-2 rounded-lg bg-neutral-100 p-1">
                {(["english", "hinglish"] as Language[]).map((l) => (
                  <button key={l} onClick={() => update({ language: l })} className={`rounded-md py-2 text-sm font-medium ${w.language === l ? "bg-white text-ink shadow-sm" : "text-neutral-500"}`}>
                    {l === "english" ? "English" : "Hinglish"}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-5 text-xs leading-relaxed text-neutral-500">Your answers are used to generate suggestions. We never share your followers&apos; details, and we don&apos;t log in to your accounts.</p>
          </section>
        )}

        {/* STEP 5: DIRECTIONS */}
        {step === "directions" &&
          (loadingDirs ? (
            <section className="mt-6 rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <Thinking title="Finding what you could sell" messages={DIRECTION_MESSAGES} note="This usually takes 10–20 seconds." />
            </section>
          ) : (
            <section className="mt-6">
              <h2 className="text-xl font-semibold text-ink">Choose your direction</h2>
              <p className="mt-1 text-sm text-neutral-600">Three ideas based on your answers. Pick the one that feels most like you.</p>
              {dirSource === "starter" && directions.length > 0 && <p className="mt-3 rounded-lg border border-neutral-200 bg-white p-3 text-xs text-neutral-600">These are starting points from your topics. Tap &ldquo;Show me different ideas&rdquo; for more tailored ones.</p>}
              <div className="mt-4 space-y-3">
                {directions.map((d, i) => (
                  <button key={d.title + i} onClick={() => setPicked(i)} className={`block w-full rounded-xl border bg-white p-4 text-left shadow-sm transition ${picked === i ? "border-violet ring-2 ring-violet" : "border-neutral-200 hover:border-neutral-300"}`}>
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${picked === i ? "border-violet bg-violet text-[10px] text-white" : "border-neutral-300"}`}>{picked === i ? "✓" : ""}</span>
                      <div className="flex-1">
                        <p className="text-base font-semibold leading-snug text-ink">{d.title}</p>
                        <p className="mt-1 text-sm text-neutral-600">{d.whyYou}</p>
                        <p className="mt-2 text-xs text-neutral-500">
                          <span className="font-medium text-neutral-700">Who pays:</span> {d.buyers}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {d.productIdeas.map((x) => (
                            <span key={x} className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                              {x}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <button onClick={() => fetchDirections(directions.map((d) => d.title))} className="rounded-lg border border-neutral-300 bg-white py-2.5 text-sm font-medium text-ink hover:bg-neutral-50">
                  Show me different ideas
                </button>
                {showOwn ? (
                  <div className="flex gap-2">
                    <input value={ownNiche} onChange={(e) => setOwnNiche(e.target.value)} maxLength={80} placeholder="e.g. Saree draping for working women" className={`${input} min-w-0 flex-1`} />
                    <button disabled={ownNiche.trim().length < 4} onClick={() => build({ title: ownNiche.trim(), whyYou: "", buyers: "", productIdeas: [], emoji: "" })} className="rounded-lg bg-violet px-4 text-sm font-semibold text-white disabled:opacity-40">
                      Use
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowOwn(true)} className="text-sm font-medium text-violet hover:underline">
                    I already know my niche
                  </button>
                )}
              </div>
            </section>
          ))}
      </div>

      {/* Sticky action */}
      {step !== "intro" && !(step === "directions" && loadingDirs) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-lg px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {step === "directions" ? (
              <button disabled={picked === null} onClick={() => picked !== null && build(directions[picked])} className="w-full rounded-xl bg-violet py-3.5 text-base font-semibold text-white shadow-sm hover:bg-violet/90 disabled:bg-neutral-300">
                {picked === null ? "Select a direction" : "Build my store →"}
              </button>
            ) : (
              <button disabled={!canNext[step]} onClick={() => (step === "topics" ? fetchDirections() : go(FLOW[stepIndex + 1]))} className="w-full rounded-xl bg-violet py-3.5 text-base font-semibold text-white shadow-sm hover:bg-violet/90 disabled:bg-neutral-300">
                {step === "topics" ? "See my options →" : "Continue →"}
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
