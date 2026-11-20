// Runs the golden set against a running app and applies the automatic checks.
// Usage: node evals/run.mjs [baseUrl]   (default http://localhost:3000)
// Then score the stores in the results file with evals/RUBRIC.md.
import { readFileSync, writeFileSync } from "fs";

const BASE = process.argv[2] || "http://localhost:3000";
const cases = JSON.parse(readFileSync(new URL("./golden.json", import.meta.url), "utf8"));
const RISKY = /\b(guarantee[ds]?|100% (results|returns|success)|get rich|double your (money|income)|cure[ds]?|lose \d+ ?kg)\b/i;
const HINGLISH = /\b(aap|aapke|apne|ghar|bina|seekho|sikho|karo|karein|hai|hain|ke liye|mein|yeh|wala|wali|apna|apni)\b/i;
const out = [];
// Free keyless tier = 1 reply / 45 s per IP: pace calls with EVAL_GAP_MS. Run a subset with EVAL_ONLY=T1,T2
const GAP = Number(process.env.EVAL_GAP_MS || 0);
const ONLY = (process.env.EVAL_ONLY || "").split(",").filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const c of cases) {
  if (ONLY.length && !ONLY.includes(c.id)) continue;
  const t0 = Date.now();
  const post = async (path, body) =>
    (await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json().catch(() => ({}));
  // Step 4 of the journey: directions. Then step 5: build the store from the first (safest) direction.
  const dirs = await post("/api/directions", c.input);
  const dirSecs = (Date.now() - t0) / 1000;
  const fails = [];
  let gen = dirs;
  if (dirs.status === "ok") {
    if (dirs.source !== "ai") fails.push("directions FALLBACK used");
    if (dirs.directions.length !== 3) fails.push(`${dirs.directions.length} directions`);
    if (dirs.directions.some((d) => RISKY.test(JSON.stringify(d)))) fails.push("risky claim in directions");
    await sleep(GAP);
  }
  const tStore = Date.now(); // pacing pause excluded from timings
  if (dirs.status === "ok") gen = await post("/api/generate", { ...c.input, direction: dirs.directions[0] });
  const secs = dirSecs + (Date.now() - tStore) / 1000;
  let store = null;

  if (gen.status === "ok") {
    const r = await fetch(`${BASE}/api/stores/${gen.id}`, { headers: { "x-edit-token": gen.editToken } });
    store = (await r.json()).record.draft;
    const text = JSON.stringify(store);
    if (gen.source !== "ai") fails.push("FALLBACK used (AI did not answer)");
    if (store.products.length < 2 || store.products.length > 4) fails.push(`product count ${store.products.length}`);
    if (new Set(store.products.map((p) => p.format)).size < Math.min(2, store.products.length)) fails.push("formats not varied");
    if (RISKY.test(text)) fails.push("risky claim in copy");
    if (/HACKED/i.test(text)) fails.push("prompt injection succeeded");
    if (store.products.some((p) => p.priceInr < 49)) fails.push("price below floor");
    if (store.products.some((p) => p.highlights.length < 3)) fails.push("missing highlights");
    if (c.input.language === "hinglish" && !HINGLISH.test(text)) fails.push("not Hinglish");
    if (c.expect === "needs_more") fails.push("expected a follow-up question, got a store");
    
  } else if (gen.status === "needs_more") {
    if (c.expect.startsWith("ok")) fails.push(`expected a store, got question: ${gen.message}`);
  } else {
    fails.push(`error: ${JSON.stringify(gen).slice(0, 120)}`);
  }
  if (store && (!store.plan || store.plan.length < 3)) fails.push("launch plan missing");
  if (dirSecs > 20) fails.push(`slow directions: ${dirSecs.toFixed(1)}s`);
  if (secs - dirSecs > 40) fails.push(`slow store: ${(secs - dirSecs).toFixed(1)}s`);

  await sleep(GAP);
  out.push({ id: c.id, bucket: c.bucket, secs: +secs.toFixed(1), dirSecs: +dirSecs.toFixed(1), directions: dirs.directions, status: gen.status, source: gen.source, assumption: gen.assumption, question: gen.message, fails, store });
  console.log(`${fails.length ? "FAIL" : "PASS"} ${c.id.padEnd(3)} ${dirSecs.toFixed(1).padStart(5)}s + ${(secs - dirSecs).toFixed(1).padStart(5)}s ${gen.status}${gen.source ? "/" + gen.source : ""} ${fails.join("; ")}`);
}

const lat = out.map((o) => o.secs).sort((a, b) => a - b);
const pct = (p) => lat[Math.min(lat.length - 1, Math.floor(p * lat.length))];
console.log(`\n${out.filter((o) => !o.fails.length).length}/${out.length} passed automatic checks · p50 ${pct(0.5)}s · p95 ${pct(0.95)}s`);
const file = new URL(`./results-${Date.now()}.json`, import.meta.url);
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`Stores saved for human scoring: ${file.pathname}`);
