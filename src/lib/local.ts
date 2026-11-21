"use client";

import type { CreatorInput, Storefront } from "./types";

/**
 * No database: the creator's drafts live in their own browser (this device).
 * The published version travels inside its share link (see lib/share.ts).
 */
export interface LocalStore {
  id: string;
  input: CreatorInput;
  draft: Storefront;
  source: "ai" | "starter";
  publicPath: string | null; // "/s/<code>" once published
  shortUrl?: string; // tinyurl version of the public link
  publishedDraft: Storefront | null;
  edits: Record<string, number>; // edit-depth diagnostic: which AI fields the creator changed
  createdAt: number;
  updatedAt: number;
}

export type SavedStore = { id: string; name: string; at: number };
const INDEX = "sf:stores:v2";
const key = (id: string) => `sf:store:${id}`;

export function listSaved(): SavedStore[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX) || "[]") as SavedStore[];
  } catch {
    return [];
  }
}

export function saveLocalStore(s: LocalStore) {
  try {
    localStorage.setItem(key(s.id), JSON.stringify(s));
    const name = s.draft.creator.handle ? `@${s.draft.creator.handle}` : s.draft.creator.displayName || "My store";
    const rest = listSaved().filter((x) => x.id !== s.id);
    localStorage.setItem(INDEX, JSON.stringify([{ id: s.id, name, at: s.updatedAt }, ...rest].slice(0, 10)));
    return true;
  } catch {
    return false; // private mode / storage full: the editor still works for this session
  }
}

export function getLocalStore(id: string): LocalStore | null {
  try {
    const raw = localStorage.getItem(key(id));
    return raw ? (JSON.parse(raw) as LocalStore) : null;
  } catch {
    return null;
  }
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

export function dismissFlash(id: string, k?: "assumption" | "notice") {
  try {
    if (!k) return localStorage.removeItem(`sf:flash:${id}`);
    const cur = readFlash(id) || {};
    delete cur[k];
    localStorage.setItem(`sf:flash:${id}`, JSON.stringify(cur));
  } catch {}
}
