"use client";

/**
 * Ask the free AI from the visitor's own browser. Returns the raw reply text, or "" if it
 * couldn't (the server then tries itself, then falls back). `onWait` reports a cooldown.
 */
export async function askFromBrowser(
  stage: "directions" | "store",
  payload: Record<string, unknown>,
  onWait?: (secs: number) => void,
): Promise<string> {
  try {
    const prep = await fetch("/api/ai/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, stage }),
    }).then((r) => r.json());
    if (prep?.mode !== "browser") return "";

    const send = (signal: AbortSignal) =>
      fetch(prep.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: prep.model, messages: prep.messages, response_format: { type: "json_object" }, temperature: 0.7 }),
        signal,
      });

    const started = Date.now();
    for (let tries = 0; tries < 3; tries++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 45_000);
      try {
        const res = await send(ctrl.signal);
        if (res.status === 402 || res.status === 429) {
          // Free tier: one reply per ~45 s per visitor. Wait it out if it's short.
          const text = await res.text();
          const secs = Number(res.headers.get("retry-after")) || Number(text.match(/retry after (\d+)\s*s/i)?.[1]) || 0;
          if (!secs || secs > 50 || Date.now() - started + secs * 1000 > 60_000) return "";
          onWait?.(secs);
          await new Promise((r) => setTimeout(r, (secs + 1) * 1000));
          continue;
        }
        if (!res.ok) return "";
        const data = await res.json();
        return data?.choices?.[0]?.message?.content || "";
      } finally {
        clearTimeout(timer);
      }
    }
  } catch {
    /* network/abort → let the server handle it */
  }
  return "";
}
