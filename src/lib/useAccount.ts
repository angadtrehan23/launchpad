"use client";

import { useEffect, useState } from "react";

export type Account = { id: string; name: string; phone: string; instagram: { handle: string; code: string; status: "pending" | "verified" | "rejected" } | null };

/** The logged-in creator: undefined while loading, null when logged out. */
export function useAccount() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => live && setAccount(d.account ?? null))
      .catch(() => live && setAccount(null));
    return () => {
      live = false;
    };
  }, []);
  return [account, setAccount] as const;
}

export async function logoutCreator() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.assign("/");
}
