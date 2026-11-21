import Link from "next/link";
import type { ReactNode } from "react";

/** Same top bar everywhere: the logo and a Home button always take you to the start page. */
export default function TopNav({ right, maxW = "max-w-lg" }: { right?: ReactNode; maxW?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
      <div className={`mx-auto flex ${maxW} items-center justify-between gap-2 px-4 py-2.5`}>
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink" aria-label="Launchpad home">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet text-sm text-white">L</span>
          Launchpad
        </Link>
        <nav className="flex items-center gap-1.5 text-sm">
          {right}
          <Link href="/" className="rounded-lg border border-neutral-200 px-2.5 py-1.5 font-medium text-neutral-700 hover:bg-neutral-50">
            ⌂ Home
          </Link>
        </nav>
      </div>
    </header>
  );
}
