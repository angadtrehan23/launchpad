"use client";

/** Per-device memory of stores this person created (no login yet). */
export type SavedStore = { id: string; token: string; name: string; at: number };
const KEY = "sf:stores";

export function listSaved(): SavedStore[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as SavedStore[];
  } catch {
    return [];
  }
}

export function rememberStore(s: SavedStore) {
  try {
    const rest = listSaved().filter((x) => x.id !== s.id);
    localStorage.setItem(KEY, JSON.stringify([s, ...rest].slice(0, 10)));
  } catch {
    /* private mode: the edit link in the URL still works */
  }
}

export function tokenFor(id: string): string | null {
  return listSaved().find((s) => s.id === id)?.token ?? null;
}

/** AI notes for the creator ("we guessed…"). Kept until dismissed, so a refresh doesn't lose them. */
export function setFlash(id: string, data: { assumption?: string; notice?: string }) {
  try {
    localStorage.setItem(`sf:flash:${id}`, JSON.stringify(data));
  } catch {}
}

export function readFlash(id: string): { assumption?: string; notice?: string } | null {
  try {
    const raw = localStorage.getItem(`sf:flash:${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function dismissFlash(id: string, key?: "assumption" | "notice") {
  try {
    if (!key) return localStorage.removeItem(`sf:flash:${id}`);
    const cur = readFlash(id) || {};
    delete cur[key];
    localStorage.setItem(`sf:flash:${id}`, JSON.stringify(cur));
  } catch {}
}
