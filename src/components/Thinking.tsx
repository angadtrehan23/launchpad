"use client";

import { useEffect, useState } from "react";

/** A calm "working on it" state: animated orb, rotating status lines and a moving progress bar. */
export default function Thinking({ title, messages, note }: { title: string; messages: string[]; note?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % messages.length), 2400);
    return () => clearInterval(t);
  }, [messages.length]);

  return (
    <div className="flex flex-col items-center px-6 py-10 text-center" role="status" aria-live="polite">
      <div className="relative h-20 w-20">
        <div className="absolute inset-0 animate-ping rounded-full bg-violet/20" style={{ animationDuration: "2.2s" }} />
        <div className="absolute inset-2 animate-spin rounded-full border-[3px] border-violet/15 border-t-violet" style={{ animationDuration: "1.1s" }} />
        <div className="absolute inset-[26px] rounded-full bg-gradient-to-br from-violet to-fuchsia-500" />
      </div>
      <h2 className="mt-6 text-xl font-semibold text-ink">{title}</h2>
      <p key={i} className="mt-2 min-h-[1.5rem] text-sm text-neutral-600 [animation:fadein_.4s_ease]">{messages[i]}</p>
      <div className="mt-6 h-1.5 w-56 overflow-hidden rounded-full bg-neutral-200">
        <div className="h-full w-1/3 rounded-full bg-violet [animation:slide_1.4s_ease-in-out_infinite]" />
      </div>
      {note && <p className="mt-5 max-w-xs text-xs text-neutral-500">{note}</p>}
    </div>
  );
}
