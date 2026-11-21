import type { Metadata } from "next";
import Link from "next/link";
import { RISKY } from "@/lib/ai";
import { getCreator, getSaved, storeIdBySlug } from "@/lib/db";
import { decodeStore, publicText } from "@/lib/share";
import type { Storefront } from "@/lib/types";
import PublicStore from "./PublicStore";

export const instant = false;

type Loaded = { store: Storefront; slug: string | null; verified: string | null };

/** Published stores live in the database at /s/<slug>. Older self-contained links (/s/1…) still open, read-only. */
async function load(slug: string): Promise<Loaded | null> {
  if (/^[a-z0-9-]{1,60}$/.test(slug)) {
    const id = await storeIdBySlug(slug).catch(() => null);
    const saved = id ? await getSaved(id).catch(() => null) : null;
    if (saved?.published && !RISKY.test(publicText(saved.published))) {
      const owner = await getCreator(saved.ownerId).catch(() => null);
      const ig = owner?.instagram;
      const verified = ig?.status === "verified" ? ig.handle : null;
      return { store: saved.published, slug, verified };
    }
  }
  const legacy = slug.startsWith("1") && slug.length > 60 ? decodeStore(slug) : null;
  return legacy ? { store: legacy, slug: null, verified: null } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const got = await load((await params).slug);
  if (!got) return { title: "Store not found", robots: { index: false } };
  const s = got.store;
  const title = `${s.creator.displayName} — ${s.creator.tagline}`;
  return { title, description: s.creator.bio, robots: { index: false, follow: false }, openGraph: { title, description: s.creator.bio, type: "website" } };
}

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const got = await load((await params).slug);
  if (!got) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <p className="text-4xl">🛍️</p>
          <h1 className="mt-4 text-xl font-bold">We couldn&apos;t find this store</h1>
          <p className="mt-2 text-sm text-neutral-600">Check the link with the creator. They may have changed it.</p>
          <Link href="/" className="mt-6 inline-block rounded-xl bg-violet px-5 py-3 text-sm font-semibold text-white">
            Go to Launchpad
          </Link>
        </div>
      </main>
    );
  }
  return <PublicStore store={got.store} slug={got.slug} verified={got.verified} />;
}
