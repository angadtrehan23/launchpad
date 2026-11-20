import { getFunnel } from "@/lib/db";
import { json } from "@/lib/server";

/** Anonymous funnel totals: started → directions → store → published → waitlist joins. No personal data. */
export async function GET() {
  const f = await getFunnel();
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  return json({
    ...f,
    rates: {
      started_to_published_pct: pct(f.published, f.wizard_started),
      generated_to_published_pct: pct(f.published, f.store_generated),
    },
  });
}
