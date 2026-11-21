"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import TopNav from "@/components/TopNav";

const input = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none focus:border-violet focus:ring-2 focus:ring-violet/20";

export default function LoginForm() {
  const params = useSearchParams();
  const next = (params.get("next") || "/dashboard").startsWith("/") ? params.get("next") || "/dashboard" : "/dashboard";
  const [mode, setMode] = useState<"signup" | "login">(params.get("mode") === "login" ? "login" : "signup");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  // Already logged in: go straight on.
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? window.location.replace(next) : null))
      .catch(() => {});
  }, [next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { name, phone, password } : { phone, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "exists") setMode("login");
        throw new Error(data.error || "Something went wrong. Please try again.");
      }
      window.location.assign(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#F7F7FB]">
      <TopNav />
      <div className="mx-auto w-full max-w-md px-4 pt-8 pb-16">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">{mode === "signup" ? "Create your creator account" : "Welcome back"}</h1>
        <p className="mt-2 text-[15px] text-neutral-600">
          {mode === "signup" ? "Your stores, drafts and customer requests are saved to your account, so you can open them on any device." : "Log in with your mobile number and password."}
        </p>

        <div className="mt-6 grid grid-cols-2 rounded-xl bg-neutral-200/60 p-1 text-sm font-semibold">
          {(["signup", "login"] as const).map((m) => (
            <button key={m} type="button" onClick={() => { setMode(m); setError(""); }} className={`rounded-lg py-2 ${mode === m ? "bg-white shadow-sm text-ink" : "text-neutral-500"}`}>
              {m === "signup" ? "Create account" : "Log in"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          {mode === "signup" && (
            <label className="block">
              <span className="text-sm font-medium text-ink">Full name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="name" placeholder="e.g. Priya Sharma" className={`${input} mt-1.5`} required />
            </label>
          )}
          <label className={`block ${mode === "signup" ? "mt-4" : ""}`}>
            <span className="text-sm font-medium text-ink">Mobile number</span>
            <div className="mt-1.5 flex items-center rounded-lg border border-neutral-300 bg-white px-3 focus-within:border-violet focus-within:ring-2 focus-within:ring-violet/20">
              <span className="text-neutral-500">+91</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" maxLength={14} autoComplete="tel-national" placeholder="98765 43210" className="w-full bg-transparent px-2 py-2.5 text-base outline-none" required />
            </div>
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-medium text-ink">{mode === "signup" ? "Create a password" : "Password"}</span>
            <div className="mt-1.5 flex items-center rounded-lg border border-neutral-300 bg-white pr-2 focus-within:border-violet focus-within:ring-2 focus-within:ring-violet/20">
              <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : 1} className="w-full bg-transparent px-3 py-2.5 text-base outline-none" required />
              <button type="button" onClick={() => setShow(!show)} className="text-xs font-semibold text-neutral-500">{show ? "Hide" : "Show"}</button>
            </div>
            {mode === "signup" && <span className="mt-1 block text-xs text-neutral-500">At least 8 characters.</span>}
            {mode === "login" && (
              <button type="button" onClick={() => setForgot(!forgot)} className="mt-1.5 text-xs font-semibold text-violet">
                Forgot password?
              </button>
            )}
            {mode === "login" && forgot && (
              <span className="mt-1 block rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-600">
                Message the Launchpad team from the number on your account. We&apos;ll check it&apos;s you and send a temporary password, which you can use to log in.
              </span>
            )}
          </label>
          {error && <p className="mt-4 rounded-lg bg-red-50 p-2.5 text-sm text-red-700" role="alert">{error}</p>}
          <button disabled={busy} className="mt-5 w-full rounded-xl bg-violet py-3.5 text-base font-semibold text-white shadow-sm hover:bg-violet/90 disabled:opacity-60">
            {busy ? "Please wait…" : mode === "signup" ? "Create account →" : "Log in →"}
          </button>
        </form>
      </div>
    </main>
  );
}
