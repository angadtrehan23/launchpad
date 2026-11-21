"use client";

import { useCallback, useEffect, useState } from "react";
import TopNav from "@/components/TopNav";
import { PLATFORM_META, type InstagramCheck, type Platform } from "@/lib/types";

type StoreRow = { id: string; title: string; niche: string; products: number; slug: string | null; publishedAt: string | null; updatedAt: string; requests: number };
type CreatorRow = { id: string; name: string; phone: string; createdAt: string; lastLoginAt: string; instagram: InstagramCheck | null; platforms: { platform: Platform; handle: string; followers: string }[]; stores: StoreRow[] };
type Funnel = Record<string, number>;

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const input = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none focus:border-violet";

export default function Admin() {
  const [state, setState] = useState<"loading" | "setup" | "login" | "ready">("loading");
  const [rows, setRows] = useState<CreatorRow[]>([]);
  const [funnel, setFunnel] = useState<Funnel>({});
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/creators", { cache: "no-store" });
    if (r.status === 401) {
      const s = await fetch("/api/admin/setup", { cache: "no-store" }).then((x) => x.json()).catch(() => ({ setUp: true }));
      setState(s.setUp ? "login" : "setup");
      return;
    }
    const d = await r.json();
    setRows(d.creators || []);
    setFunnel(d.funnel || {});
    setState("ready");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function auth(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const r = await fetch(state === "setup" ? "/api/admin/setup" : "/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setError(d.error || "Couldn't log in.");
    setPassword("");
    load();
  }

  async function review(creatorId: string, status: "verified" | "rejected") {
    await fetch("/api/admin/instagram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creatorId, status }) });
    load();
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setState("login");
  }

  const shown = rows.filter((c) => !q.trim() || `${c.name} ${c.phone} ${c.instagram?.handle || ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const pending = rows.filter((c) => c.instagram?.status === "pending");
  const published = rows.reduce((n, c) => n + c.stores.filter((s) => s.slug).length, 0);
  const totalStores = rows.reduce((n, c) => n + c.stores.length, 0);
  const totalReq = rows.reduce((n, c) => n + c.stores.reduce((m, s) => m + s.requests, 0), 0);

  return (
    <main className="min-h-dvh bg-[#F7F7FB]">
      <TopNav maxW="max-w-5xl" right={state === "ready" && <button onClick={logout} className="px-2 py-1.5 font-medium text-neutral-500 hover:text-ink">Log out</button>} />
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16">
        <h1 className="text-[26px] font-bold tracking-tight text-ink">Creators</h1>
        <p className="mt-1 text-sm text-neutral-600">Everyone who signed up to build a store, with their setup details, drafts and live links.</p>

        {state === "loading" && <div className="mt-6 h-24 animate-pulse rounded-xl bg-neutral-200/60" />}

        {(state === "setup" || state === "login") && (
          <form onSubmit={auth} className="mt-6 max-w-sm rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-ink">{state === "setup" ? "Set the admin password" : "Admin login"}</p>
            <p className="mt-1 text-xs text-neutral-500">{state === "setup" ? "First visit: choose a password (10+ characters). Only you will use it." : "Enter the admin password."}</p>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={state === "setup" ? "new-password" : "current-password"} className={`${input} mt-3`} />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <button className="mt-3 w-full rounded-xl bg-violet py-3 text-sm font-semibold text-white">{state === "setup" ? "Save and open" : "Log in"}</button>
          </form>
        )}

        {state === "ready" && (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {(
                [
                  ["Creators", rows.length],
                  ["Stores built", totalStores],
                  ["Published", published],
                  ["Customer requests", totalReq],
                  ["Instagram to review", pending.length],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-xl border border-neutral-200 bg-white p-4">
                  <p className="text-xs font-medium text-neutral-500">{k}</p>
                  <p className="mt-1 text-2xl font-bold text-ink">{v}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Funnel since launch: {funnel.signed_up || 0} sign-ups → {funnel.directions_shown || 0} saw directions → {funnel.store_generated || 0} stores built → {funnel.published || 0} published → {funnel.waitlist_join || 0} customer requests
            </p>

            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, number or Instagram" className={`${input} mt-6 max-w-sm`} />

            <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Creator</th>
                    <th className="px-4 py-3 font-semibold">Channels</th>
                    <th className="px-4 py-3 font-semibold">Instagram check</th>
                    <th className="px-4 py-3 font-semibold">Stores</th>
                    <th className="px-4 py-3 font-semibold">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c.id} className="border-b border-neutral-100 align-top last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{c.name}</p>
                        <p className="text-xs text-neutral-500">+91 {c.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-600">
                        {c.platforms.length
                          ? c.platforms.map((p) => (
                              <p key={p.platform}>
                                {PLATFORM_META[p.platform]?.label || p.platform}
                                {p.handle ? ` @${p.handle}` : ""} · {p.followers}
                              </p>
                            ))
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {!c.instagram ? (
                          <span className="text-neutral-400">Not started</span>
                        ) : (
                          <div>
                            <a href={`https://www.instagram.com/${c.instagram.handle}/`} target="_blank" rel="noopener noreferrer" className="font-semibold text-violet underline">
                              @{c.instagram.handle} ↗
                            </a>
                            <p className="mt-0.5 text-neutral-500">
                              Code in bio: <b className="font-mono text-ink">{c.instagram.code}</b>
                            </p>
                            {c.instagram.status === "pending" ? (
                              <div className="mt-1.5 flex gap-1.5">
                                <button onClick={() => review(c.id, "verified")} className="rounded-md bg-emerald-600 px-2 py-1 font-semibold text-white">
                                  Code found ✓
                                </button>
                                <button onClick={() => review(c.id, "rejected")} className="rounded-md border border-neutral-300 px-2 py-1 font-semibold text-neutral-600">
                                  Not found
                                </button>
                              </div>
                            ) : (
                              <p className={`mt-1 font-semibold ${c.instagram.status === "verified" ? "text-emerald-700" : "text-red-600"}`}>{c.instagram.status === "verified" ? "Verified" : "Rejected"}</p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {c.stores.length === 0 ? (
                          <span className="text-neutral-400">No store yet</span>
                        ) : (
                          c.stores.map((s) => (
                            <div key={s.id} className="mb-2 last:mb-0">
                              <p className="font-medium text-ink">{s.title}</p>
                              <p className="text-neutral-500">
                                {s.slug ? (
                                  <a href={`/s/${s.slug}`} target="_blank" rel="noopener noreferrer" className="text-violet underline">
                                    /s/{s.slug}
                                  </a>
                                ) : (
                                  "Draft"
                                )}{" "}
                                · {s.products} products · {s.requests} requests · updated {when(s.updatedAt)}
                              </p>
                            </div>
                          ))
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-500">
                        {when(c.createdAt)}
                        <p className="mt-0.5">Last login {when(c.lastLoginAt)}</p>
                      </td>
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500">
                        No creators yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
