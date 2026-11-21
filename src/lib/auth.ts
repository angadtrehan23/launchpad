import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { promisify } from "util";
import { createSession, endSession, getCreator, readSession, SESSION_MAX_AGE } from "./db";
import type { CreatorAccount } from "./types";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const CREATOR_COOKIE = "lp_session";
export const ADMIN_COOKIE = "lp_admin";

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32);
  return `s1$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [v, salt, key] = stored.split("$");
  if (v !== "s1" || !salt || !key) return false;
  const want = Buffer.from(key, "base64");
  const got = await scrypt(pw, Buffer.from(salt, "base64"), want.length);
  return got.length === want.length && timingSafeEqual(got, want);
}

export const cleanPhone = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);
export const phoneValid = (p: string) => /^[6-9]\d{9}$/.test(p);
export const PASSWORD_MIN = 8;

async function setCookie(name: string, token: string) {
  (await cookies()).set(name, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE });
}

export async function startCreatorSession(creatorId: string) {
  await setCookie(CREATOR_COOKIE, await createSession("sess", creatorId));
}
export async function startAdminSession() {
  await setCookie(ADMIN_COOKIE, await createSession("asess", "admin"));
}

export async function logout(kind: "creator" | "admin") {
  const jar = await cookies();
  const name = kind === "creator" ? CREATOR_COOKIE : ADMIN_COOKIE;
  const token = jar.get(name)?.value;
  if (token) await endSession(kind === "creator" ? "sess" : "asess", token);
  jar.delete(name);
}

/** The logged-in creator, or null. */
export async function currentCreator(): Promise<CreatorAccount | null> {
  const token = (await cookies()).get(CREATOR_COOKIE)?.value;
  if (!token) return null;
  const id = await readSession("sess", token);
  return id ? getCreator(id) : null;
}

export async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return !!token && (await readSession("asess", token)) === "admin";
}

/** What the browser is allowed to see about an account. */
export function publicAccount(c: CreatorAccount) {
  return { id: c.id, name: c.name, phone: c.phone, instagram: c.instagram ? { handle: c.instagram.handle, code: c.instagram.code, status: c.instagram.status } : null };
}
