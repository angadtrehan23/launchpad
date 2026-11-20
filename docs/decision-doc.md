# Launchpad — decision doc
*AI Storefront Generator · a concept for SuperProfile*

## 1. The problem, as I understand it
SuperProfile's onboarding promises "publish your first product in minutes": upload a PDF, set a price, get a page. That is instant **only if you already know what the PDF is**. The stalled creator in the brief has an audience and expertise but hasn't turned either into an offer. So three questions block them at the empty store: *what do I sell, what do I charge, what do I say?*

From SuperProfile's own site, nothing answers those today:
- no guidance on what to sell, personal to the creator;
- no pricing suggestions;
- Super AI works on a store that already exists.

**Reframe.** The real job isn't "generate a storefront". It's **"help me decide what to sell, and prove someone wants it, before I spend weeks making it."** The AI suggests products the creator **hasn't made yet**. Publishing a store selling a non-existent e-book, then sending buyers to a dead-end checkout, would be a store nobody is proud of. So the first store is a **demand test**: every button collects a waitlist sign-up (or a slot request for calls and workshops). The creator learns what to build from their own followers. Then they unlock payments on SuperProfile's paid plan, which is SuperProfile's revenue moment.

**Assumptions** (to replace with real data):
- INR price ranges by format × audience size are my estimates, not SuperProfile sales data.
- Total audience ≈ the sum of follower ranges across platforms.
- Creators will answer by tapping more readily than by writing a description.
- Waitlist intent predicts sales well enough to guide what to build first.

## 2. User and flow
**Primary user:** an Indian creator with 5K–1L followers across one or more platforms, on a phone, comfortable in English or Hinglish, who has never priced anything.
**Secondary user:** a teacher or professional with no social presence. They choose "I'm not on social yet" and get the lowest price tier.

```
 Tap where you create ─► Do you earn from it? ─► Tap topics (+ own words, language)
          │                                              │
          ▼                                              ▼
 (rules: audience tier, valid handles)        AI: 3 directions (niche angles)
                                                         │  pick / show 3 more / type my own
                                                         ▼
                                  AI: store (bio, 2–4 products, ₹ prices + why, copy)
                                      + 2-week launch plan using SuperProfile features
                                                         │
                       edit any field · ↻ one part · regenerate all · theme
                                                         │
                                                 Publish → /s/handle-x7k2
                                                         │
                     Follower taps a product → joins waitlist / requests a slot
                                                         │
                 Creator sees demand per product → builds the winner → unlocks payments
```

**Main-screen alternatives I rejected**
1. **Input: a one-line description form.** It looks faster, but it assumes the creator can already name their niche, which is exactly the stalled creator's problem. Tapping platforms, earnings and topics is answerable by anyone, gives the AI structured context, and makes the AI's first output a choice between 3 directions, not a verdict.
2. **Editor: a form with fields on one side and a preview on the other.** It's cramped on a phone and feels like admin work. Instead the creator edits **the real store**: tap any text to edit it in a bottom sheet, ↻ on any section for a new AI version.

## 3. Key decisions and trade-offs
| Decision | Why | Trade-off |
|---|---|---|
| **AI writes the words; rules set the price range** | An LLM alone will price a beginner's e-book at ₹2,999. Ranges by format × audience tier are enforced in code, snapped to familiar points (₹199, ₹499…). The AI picks inside the range and explains it ("Why ₹199?") | The ranges are my guesses until real sales data replaces them |
| **Waitlist instead of checkout** | Products don't exist yet; this turns a dead end into demand data and gives the free plan a reason to upgrade | No money changes hands in the prototype |
| **A fixed 2-step workflow, not an agent** | The path never changes (directions → store), so a workflow is faster, cheaper and testable. An agent would add failure points for no gain | Less flexible; it can't, say, research competitors |
| **No Instagram scraping** | Blocked or against platform terms, and fragile on a demo link. Usernames are hints and the slug; the creator's own taps and words are the signal | We don't see real posts; the AI may guess the niche and says so in a banner |
| **Free, keyless AI by default** (open-weights GPT-OSS 20B) | Real LLM calls at zero cost. A Claude or Gemini key switches in by environment variable | Smaller model, plus a free-tier limit of 1 reply per 45 s, handled by waiting or falling back |
| **No login; a private edit link** | Removes the biggest drop-off step for a first-session flow | Losing the link means losing edit access (the link is offered before publishing) |
| **Gen Z "sticker" visual system** | The audience lives on Instagram; bold outlines, lime "selected" states and big type feel native. The default store theme is Candy | Louder than SuperProfile's current look; 4 classic themes are kept |
| **Safe for a public link** | Store links always get a short suffix (no one can claim `/s/viratkohli`), sign-ups are deletable by the creator, creator answers sent to the AI are disclosed, and `PUBLISH_PAUSED` / `AI_DISABLED` act as kill switches | Slightly less pretty links; real handle verification needs login |

## 4. What I deliberately did not build
- **Payments and checkout:** SuperProfile already has them; the waitlist validates demand first.
- **Login and accounts:** they kill first-session activation; the edit link is enough for a prototype.
- **Instagram scraping or login:** terms and fragility. Official API access is a "next 2 weeks" item.
- **Profile photo upload:** needs storage and moderation; an initials avatar works for now.
- **Devanagari Hindi output:** Hinglish covers how these creators actually write; Hindi script is next.
- **Unpublish/delete, multiple stores, custom links:** a lifecycle and moderation surface not needed to test the bet.
- **Auto-publish:** a human always reviews before anything goes public.

## 5. How the AI works
- **Two calls, each with a fixed output contract** (Zod schemas):
  - *directions*: 3 niche angles with "why you", "who pays" and example products;
  - *store*: bio, 2–4 products, a 5-step plan. Every launch step must use a feature from a fixed list of real SuperProfile features.
- **Prompting:** a stable system prompt (audience, honesty rules, formats, language). The creator's input goes in `<creator_input>` tags and is treated as data, which defends against prompt injection. For the small open model, the prompt shows a filled-in example of the shape, and the Hinglish rule is repeated at the end.
- **Quality control in code, after the model:**
  - parse and validate against the schema, mapping near-miss values;
  - clamp lengths;
  - move prices into their range, and rewrite the "why" if the number moved;
  - drop duplicate products;
  - force buttons to match the format ("Request a slot" vs "Join the waitlist");
  - **block guaranteed-result, cure and income claims**, both in AI output and in what the creator types at publish.
- **Failure handling:**
  - one time limit per request (50 s, under the 60 s server cap), with one retry if time allows;
  - free-tier cooldowns are waited out when they fit;
  - otherwise a **clearly labelled starter store** built only from the creator's own topic picks (never their raw text);
  - regenerating a single part never overwrites anything if it fails;
  - "regenerate all" keeps the creator's corrections.
- **Evidence:**
  - a 15-case test set (typical, edge, adversarial) with an automatic runner and a 5-point human rubric;
  - with real AI, 5 of 6 paced cases were written by the AI, the prompt injection was ignored, and the "guaranteed stock tips" case correctly fell back to the safe template;
  - a 42-check end-to-end test covers every edge case.

## 6. Success metrics
**North Star for this feature:** `new creators × first-session publish rate × % of published stores with a visitor intent signal (waitlist join or click) within 7 days`. Published stores that nobody wants don't count.

1. **First-session publish rate:** new creators who publish in their first session. **Target: +50% relative** vs today's blank-store flow (e.g. 20% → 30%; the real baseline is unknown to me).
2. **Median time from signup to published store:** **under 5 minutes.**

**How to measure:**
- A/B test on new signups: 50% see "Build my store with AI", 50% get today's blank store.
- Run 2–4 weeks; read once on the date set in advance.
- Events are already logged: session start, directions shown, generation time and source, edit depth per field, regenerations, publish time.

**Guardrails:**
- the AI group's 30-day first-sale rate must not fall more than 1 point below control;
- safety blocks and reports ≤ 0.5% of stores;
- AI fallback rate ≤ 5%.

**Diagnostic:** edit depth by field. Many price edits mean the ranges are wrong; many title edits mean the ideas are off.

## 7. Go-to-market
- **Where:** inside onboarding, at the stall moment, i.e. the first view of an empty store: "Build my store with AI in 2 minutes" next to "Start from scratch".
- **Who first:** fitness, exam prep and personal-finance education, in English and Hinglish, where the price ranges are most defensible. Then expand.
- **Loop:** every public store says "Built in 2 minutes. Make yours", and followers of creators are often creators themselves. It's tracked with a referral tag.
- **No paid acquisition:** this is activation for people who already signed up.

## 8. With 2 more weeks
1. Replace the guessed price ranges with SuperProfile's own sales data by niche × format × audience.
2. **Waitlist → "build it":** when a product crosses a demand threshold, AI drafts that e-book or course outline, which closes the loop to a first sale.
3. Login + official Instagram connection: verify handle ownership (stops impersonation), real photo and bio.
4. WhatsApp alert to the creator on new sign-ups, plus Devanagari Hindi.
5. Grow the eval set to ~50 real inputs and run it on every prompt change; compare the free model vs Claude on the human rubric.
6. Ship behind a flag and run the A/B test.

## How I used AI coding tools
I used Claude Code throughout:
- researched SuperProfile's public site;
- ran structured product passes: journey mapping, AI-suitability, eval design, risk review, metrics;
- built the Next.js app and designed the visual system;
- wrote and ran the 42-check end-to-end test and the eval runner.

The eval found 2 real bugs before any user did: the fallback echoing risky text, and keyboard mash getting through.
