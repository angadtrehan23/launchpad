import type { AudienceTier, ProductFormat } from "./types";

/**
 * Price bands in INR, by format and audience size.
 *
 * Decision: the model writes the words, these rules bound the numbers.
 * An LLM left alone will happily price a beginner's e-book at ₹2,999.
 * These bands are a first-pass assumption for Indian long-tail creators
 * (price-sensitive audiences, impulse buys under ~₹500) and are the
 * first thing we'd replace with real SuperProfile sales data.
 */
type Band = [min: number, max: number];

const BANDS: Record<ProductFormat, Record<Exclude<AudienceTier, "starting">, Band>> = {
  ebook:           { micro: [99, 299],   small: [149, 499],  mid: [199, 699],   large: [299, 999] },
  template_pack:   { micro: [149, 399],  small: [199, 599],  mid: [299, 999],   large: [399, 1499] },
  recorded_course: { micro: [299, 999],  small: [499, 1499], mid: [799, 2499],  large: [999, 3999] },
  cohort_course:   { micro: [999, 2999], small: [1499, 4999], mid: [1999, 7999], large: [2999, 9999] },
  one_on_one:      { micro: [299, 999],  small: [499, 1499], mid: [799, 2499],  large: [999, 4999] },
  community:       { micro: [99, 299],   small: [149, 499],  mid: [199, 699],   large: [299, 999] },
  workshop:        { micro: [99, 299],   small: [149, 499],  mid: [199, 799],   large: [299, 999] },
};

/** Price points Indian buyers are used to seeing. */
const PRICE_POINTS = [
  49, 99, 149, 199, 249, 299, 349, 399, 499, 599, 699, 799, 999, 1299, 1499, 1999, 2499,
  2999, 3499, 3999, 4999, 5999, 6999, 7999, 9999,
];

export function bandFor(format: ProductFormat, audience: AudienceTier): Band {
  // Experts without an audience price like micro creators: trust is not built yet.
  const tier = audience === "starting" ? "micro" : audience;
  return BANDS[format][tier];
}

/** Clamp into the band and snap to the nearest familiar price point inside it. */
export function normalisePrice(
  price: number,
  format: ProductFormat,
  audience: AudienceTier,
): { price: number; adjusted: boolean } {
  const [min, max] = bandFor(format, audience);
  const raw = Number.isFinite(price) ? price : (min + max) / 2;
  const clamped = Math.min(max, Math.max(min, raw));
  const inBand = PRICE_POINTS.filter((p) => p >= min && p <= max);
  const snapped = inBand.reduce((best, p) =>
    Math.abs(p - clamped) < Math.abs(best - clamped) ? p : best,
  inBand[0] ?? min);
  return { price: snapped, adjusted: snapped !== Math.round(price) };
}

/** Rendered into the prompt so the model reasons inside the same bands we enforce. */
export function bandTableForPrompt(audience: AudienceTier): string {
  return (Object.keys(BANDS) as ProductFormat[])
    .map((f) => {
      const [min, max] = bandFor(f, audience);
      return `- ${f}: ₹${min}–₹${max}`;
    })
    .join("\n");
}

export function formatInr(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}
