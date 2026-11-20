import type { Metadata } from "next";
import Link from "next/link";
import { decodeStore } from "@/lib/share";
import PublicStore from "./PublicStore";

// The store's content travels inside its link (see lib/share.ts), so there's nothing to look up.
export const instant = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = decodeStore(slug);
  // noindex: creator pages are unverified and unmoderated in this prototype, so keep them out of search.
  if (!s) return { title: "Store not found", robots: { index: false } };
  const title = `${s.creator.displayName} — ${s.creator.tagline}`;
  return { title, description: s.creator.bio, robots: { index: false, follow: false }, openGraph: { title, description: s.creator.bio, type: "website" } };
}

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = decodeStore(slug);
  if (!store) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <p className="text-4xl">🛍️</p>
          <h1 className="mt-4 text-xl font-bold">This store link isn&apos;t working</h1>
          <p className="mt-2 text-sm text-neutral-600">It may have been cut off when it was copied. Ask the creator to share it again.</p>
          <Link href="/" className="mt-6 inline-block rounded-xl bg-ink px-5 py-3 text-sm font-bold text-lime">
            Build your own store
          </Link>
        </div>
      </main>
    );
  }
  return <PublicStore store={store} />;
}
