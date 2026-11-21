"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { logoutCreator, useAccount } from "@/lib/useAccount";

type Row = { id: string; title: string; niche: string; slug: string | null; publishedAt: string | null; updatedAt: string; requests: number };

export default function Dashboard() {
  const [account, setAccount] = useAccount();
  const [stores, setStores] = useState<Row[] | null>(null);

  useEffect(() => {
    if (account === null) window.location.assign("/login?mode=login&next=/dashboard");
    if (!account) return;
    fetch("/api/stores", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setStores(d.stores || []))
      .catch(() => setStores([]));
  }, [account]);

  if (!account) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-violet" />
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#F7F7FB]">
      <TopNav right={<button onClick={logoutCreator} className="px-2 py-1.5 font-medium text-neutral-500 hover:text-ink">Log out</button>} />
      <div className="mx-auto w-full max-w-lg px-4 pt-6 pb-16">
        <h1 className="text-[26px] font-bold tracking-tight text-ink">Hi {account.name.split(" ")[0]} 👋</h1>
        <p className="mt-1 text-sm text-neutral-600">Your stores and drafts, saved to your account.</p>

        <Link href="/?go=1" className="mt-5 block w-full rounded-xl bg-violet py-3.5 text-center text-base font-semibold text-white shadow-sm hover:bg-violet/90">
          + Build a new store
        </Link>

        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">My stores</h2>
          {stores === null ? (
            <div className="mt-3 h-20 animate-pulse rounded-xl bg-neutral-200/60" />
          ) : stores.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-600">No stores yet. Build your first one in about 3 minutes.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {stores.map((s) => (
                <li key={s.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{s.title}</p>
                      <p className="mt-0.5 truncate text-xs text-neutral-500">{s.niche}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.slug ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{s.slug ? "Live" : "Draft"}</span>
                  </div>
                  {s.slug && <p className="mt-2 truncate text-xs text-violet">{typeof window !== "undefined" ? window.location.host : ""}/s/{s.slug}</p>}
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    <Link href={`/studio/${s.id}`} className="rounded-lg bg-violet/10 px-3 py-1.5 font-semibold text-violet">Edit</Link>
                    {s.slug && <a href={`/s/${s.slug}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-neutral-200 px-3 py-1.5 font-semibold text-neutral-700">Open page ↗</a>}
                    <span className="ml-auto text-xs text-neutral-500">{s.requests} customer request{s.requests === 1 ? "" : "s"}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <InstagramCard account={account} onChange={setAccount} />

        <p className="mt-8 text-center text-xs text-neutral-500">Logged in as +91 {account.phone}</p>
      </div>
    </main>
  );
}

function InstagramCard({ account, onChange }: { account: NonNullable<ReturnType<typeof useAccount>[0]>; onChange: (a: NonNullable<ReturnType<typeof useAccount>[0]>) => void }) {
  const ig = account.instagram;
  const [handle, setHandle] = useState(ig?.handle || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/instagram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(d.error || "Couldn't start verification. Try again.");
    onChange(d.account);
  }

  return (
    <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">Verify your Instagram</h2>
        {ig?.status === "verified" && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">✓ Verified</span>}
        {ig?.status === "pending" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">In review</span>}
      </div>
      {ig?.status === "verified" ? (
        <p className="mt-2 text-sm text-neutral-600">
          <b>@{ig.handle}</b> is verified. Your store pages show a verified badge, so followers know it&apos;s really you.
        </p>
      ) : ig?.status === "pending" ? (
        <div className="mt-2 text-sm text-neutral-600">
          <p>Add this code anywhere in your Instagram bio for <b>@{ig.handle}</b>:</p>
          <p className="mt-3 rounded-xl bg-neutral-50 py-3 text-center font-mono text-xl font-bold tracking-widest text-ink">{ig.code}</p>
          <p className="mt-3">Our team checks your bio and confirms within a day. You can remove the code once you see the verified badge.</p>
          <button onClick={() => onChange({ ...account, instagram: null })} className="mt-3 text-xs font-semibold text-neutral-500 underline">Use a different account</button>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-neutral-600">
            {ig?.status === "rejected" ? "We couldn't find the code in that bio. Check the username and try again." : "Prove the Instagram account is yours to get a verified badge on your store."}
          </p>
          <div className="mt-3 flex gap-2">
            <div className="flex flex-1 items-center rounded-lg border border-neutral-300 px-3 focus-within:border-violet">
              <span className="text-neutral-400">@</span>
              <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="yourname" className="w-full bg-transparent px-1 py-2.5 text-base outline-none" />
            </div>
            <button onClick={start} disabled={busy || !handle.trim()} className="shrink-0 rounded-lg bg-violet px-4 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "…" : "Get code"}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </>
      )}
    </section>
  );
}
