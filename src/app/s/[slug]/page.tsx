import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getStoreBySlug } from "@/lib/db";
import PublicStore from "./PublicStore";

// Always render the latest published version on the server (also gives link
// previews on WhatsApp/Instagram real titles). A Redis read is fast enough to block on.
export const instant = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const rec = await getStoreBySlug(slug).catch(() => null);
  const s = rec?.published;
  // noindex: creator pages are unverified and unmoderated in this prototype, so keep them out of search.
  if (!s) return { title: "Store not found", robots: { index: false } };
  const title = `${s.creator.displayName} — ${s.creator.tagline}`;
  return { title, description: s.creator.bio, robots: { index: false, follow: false }, openGraph: { title, description: s.creator.bio, type: "website" } };
}

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection(); // always read the latest published version
  const { slug } = await params;
  const rec = await getStoreBySlug(slug).catch(() => null);
  if (!rec?.published) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <p className="text-4xl">🛍️</p>
          <h1 className="mt-4 text-xl font-bold">This store isn&apos;t live yet</h1>
          <p className="mt-2 text-sm text-neutral-600">The link may be mistyped, or the creator hasn&apos;t published it yet.</p>
          <Link href="/" className="mt-6 inline-block rounded-xl bg-ink px-5 py-3 text-sm font-bold text-lime">
            Build your own store
          </Link>
        </div>
      </main>
    );
  }
  return <PublicStore store={rec.published} slug={rec.slug} />;
}
