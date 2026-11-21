import { json } from "@/lib/server";

/**
 * Real profile signals from a creator's PUBLIC YouTube channel page (the same title, description
 * and photo any link preview shows). Instagram doesn't allow reading profiles without its official
 * login, so Instagram creators paste their own bio/captions instead.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { handle?: string };
  const handle = String(body.handle || "")
    .trim()
    .replace(/^https?:\/\/(www\.)?youtube\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0];
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(handle)) return json({ found: false });

  try {
    const res = await fetch(`https://www.youtube.com/@${handle}/about`, {
      headers: { "Accept-Language": "en" },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return json({ found: false });
    const html = await res.text();
    const meta = (prop: string) => {
      const m = html.match(new RegExp(`<meta property="og:${prop}" content="([^"]*)"`));
      return m ? decode(m[1]) : "";
    };
    const title = meta("title").slice(0, 80);
    const description = meta("description").slice(0, 600);
    const image = meta("image");
    if (!title) return json({ found: false });
    const avatar = /^https:\/\/yt3\.(ggpht|googleusercontent)\.com\//.test(image) && image.length <= 400 ? image : "";
    return json({ found: true, title, description, avatar });
  } catch {
    return json({ found: false });
  }
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
