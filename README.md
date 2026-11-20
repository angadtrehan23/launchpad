# Launchpad: a concept for SuperProfile

New SuperProfile creators sign up, land on an empty store and stall. They have an audience but don't know **what to sell, how to price it, or what to write**. SuperProfile's own onboarding ("upload a PDF, set a price") assumes they already know. Launchpad does the figuring out.

**Flow (about 2 minutes on a phone):**
1. **Where do you create?** Tap platforms (Instagram, YouTube, LinkedIn, Moj…), add usernames and follower ranges, or "I'm not on social yet".
2. **Do you earn from it today?** Brand deals, platform payouts, affiliate, already selling, not yet.
3. **What's it about?** Tap up to 6 topic keywords, optionally write a line, pick English or Hinglish.
4. **AI suggests 3 directions:** sharp, sellable niche angles with who'd pay and example products. Pick one, ask for 3 more, or type your own.
5. **AI builds the store:** bio, 2–4 products in SuperProfile's formats with INR prices (and "why ₹499?"), descriptions, and a **2-week launch plan** using SuperProfile features.
6. **Edit anything, regenerate any part, publish** → a public page that works on a phone. **No database:** the published store lives inside its own link (`/s/<code>`), and drafts live in the creator's browser.
7. **Followers join the waitlist on WhatsApp:** tapping a product opens a pre-written message to the creator ("I'd like to join the waitlist for …"). The creator builds the product people ask for most, then unlocks payments.

Background: [`docs/superprofile-research.md`](docs/superprofile-research.md) (what SuperProfile does today and the gap) · [`docs/product-analysis.md`](docs/product-analysis.md) (journey, AI fit, eval, risks, metrics).

## Run locally

```bash
npm install
npm run dev                  # http://localhost:3000 (no keys needed)
```

**No keys, no billing.** By default the AI runs on Pollinations' free, keyless gateway (open-weights GPT-OSS 20B). The brief requires real LLM calls, and this keeps them free. A Claude key (`ANTHROPIC_API_KEY`) or any OpenAI-compatible free tier (`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`) can be swapped in by environment variable, with no code change. The visitor's browser makes the free AI call itself (own quota), and the server validates the reply.

## Deploy (Vercel)

1. Import the repo in Vercel.
2. No AI key needed (optional: set one of the keys above).
3. Nothing else: **no database, no storage, no keys.**

| Variable | Default |
|---|---|
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | Pollinations free gateway / none / `openai` (GPT-OSS 20B) |
| `ANTHROPIC_API_KEY` (optional, takes priority) | — |
| `RL_GENERATE_PER_HOUR`, `RL_REGEN_PER_HOUR`, `RL_AI_PER_DAY` | 12 / 40 per IP, 1500 total per day |

## How it's built

| Piece | Where |
|---|---|
| Wizard (platforms → earnings → topics → directions) | `src/app/page.tsx` |
| Input rules: handles, pasted links, gibberish/keyboard mash, audience tier from platforms | `src/lib/input.ts` |
| INR price ranges by format × audience tier, snapped to familiar price points | `src/lib/pricing.ts` |
| Prompts: directions + store/plan; creator input wrapped as data | `src/lib/prompts.ts` |
| AI calls: structured output (Zod), code review, one retry inside a 50 s budget, labelled fallbacks | `src/lib/ai.ts` |
| Rate limits, publish-time claim check, durable-storage guard | `src/lib/server.ts`, `src/app/api/**` |
| Editor: tap to edit, ↻ per section, launch plan, WhatsApp set-up, unlock-next panel (drafts saved on the device) | `src/app/studio/[id]/Studio.tsx`, `src/lib/local.ts` |
| Public store decoded from its link + WhatsApp waitlist sheet | `src/app/s/[slug]/`, `src/lib/share.ts` |
| Eval: 15 golden cases, runner, human rubric | `evals/` |

**AI in one paragraph.** Two fixed AI steps, not an agent:
- **Directions** (3 niche angles) and **store + plan**. Each call must return JSON matching a schema.
- **Code checks every answer.** It clamps lengths, moves prices into the INR range for that format and audience, drops duplicates, and only allows launch steps that use real SuperProfile features. It also blocks guaranteed-result, cure or income claims.
- **One retry, inside a 50-second budget.** A failed check sends the problems back to the model once, within one time limit per request.
- **Fallback.** If the AI is down, the creator gets a clearly labelled starter built only from their own keyword picks. It never copies their raw text.
- **Regenerating is safe.** Regenerating one part sends the rest of the store as context. It never overwrites anything if it fails, and "regenerate all" keeps the creator's corrections.

**Safety for a public link:** honesty check at publish and on every open of a link, no visitor data stored, AI use disclosed in the wizard, kill switches `PUBLISH_PAUSED=true` / `AI_DISABLED=true`, anonymous funnel totals at `/api/funnel`.

**Edge cases handled:**
- **Input:** empty answers, invalid usernames and pasted profile links, keyboard mash, one-word input (asks once, with a "skip"), 6 unrelated topics, and Hindi-script input.
- **Slow or failed AI:** progress steps, then a labelled fallback. A failed regeneration changes nothing.
- **Publishing:** risky claims typed by the creator are blocked, a store with no products can't be published, and unpublished or missing links show a friendly page.
- **Waitlist:** phone number validation, consent, duplicates, and rate limits.
- **Pages:** `noindex` and an "unverified creator page" note.

**Not built (on purpose):** payments, login, Instagram scraping or login, profile photos, Devanagari output, unpublish/delete. Why for each: `docs/product-analysis.md` §7.

Built with Claude Code: research, product analysis (journey, AI suitability, eval, risk, metrics), implementation, and testing (42-check end-to-end smoke test + 15-case eval runner).
