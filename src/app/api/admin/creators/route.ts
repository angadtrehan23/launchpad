import { isAdmin } from "@/lib/auth";
import { countRequests, getFunnel, getSavedMany, listCreators } from "@/lib/db";
import { json } from "@/lib/server";

/** Every creator who signed up, with their setup details and stores. Admin only. */
export async function GET() {
  if (!(await isAdmin())) return json({ error: "Admin login needed." }, 401);
  const creators = (await listCreators()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const out = [];
  for (const c of creators) {
    const stores = await getSavedMany(c.storeIds);
    const reqs = await countRequests(stores.map((s) => s.id));
    out.push({
      id: c.id,
      name: c.name,
      phone: c.phone,
      createdAt: c.createdAt,
      lastLoginAt: c.lastLoginAt,
      instagram: c.instagram,
      platforms: stores[0]?.input.platforms.map((p) => ({ platform: p.platform, handle: p.handle, followers: p.followers })) || [],
      stores: stores.map((s) => ({
        id: s.id,
        title: s.draft.products[0]?.title || "Untitled",
        niche: s.input.niche,
        products: s.draft.products.length,
        slug: s.slug,
        publishedAt: s.publishedAt,
        updatedAt: s.updatedAt,
        requests: reqs[s.id] || 0,
      })),
    });
  }
  return json({ creators: out, funnel: await getFunnel() });
}
