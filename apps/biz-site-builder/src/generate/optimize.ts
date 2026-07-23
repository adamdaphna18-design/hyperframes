/**
 * A tiny **generate → evaluate against a verifiable reward → keep the best**
 * optimizer — the deterministic core of the LLM-search family (FunSearch, Eureka)
 * with the LLM removed. Those systems have an LLM *propose* candidates and a
 * deterministic evaluator *score* them against a verifiable reward, keeping the
 * survivors. This repo has the verifiable rewards (WCAG contrast, the SEO audit,
 * the a11y gate) but must stay deterministic and offline, so we keep the
 * evaluate-and-select half and enumerate the candidate space directly instead of
 * sampling it from a model. No LLM, no network, no randomness.
 *
 * First application: pick each business's link/accent "ink" colour — the most
 * vivid shade that still clears WCAG AA (4.5:1) on its own page background —
 * instead of the previous hand-fixed lightness guess.
 */

/** Return the candidate with the highest reward (first on ties). Pure argmax. */
export function searchBest<T>(candidates: readonly T[], reward: (c: T) => number): T {
  let best: T = candidates[0]!;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const score = reward(c);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** HSL (h in [0,360), s/l in [0,1]) → 8-bit sRGB. Deterministic. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/** WCAG 2.1 relative luminance of an sRGB colour. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA threshold for normal-size text. */
export const AA_CONTRAST = 4.5;

/**
 * The most vivid "ink" for a hue that still clears AA on the given background —
 * found by evaluating a lightness grid against the verifiable contrast reward and
 * keeping the lightest (most saturated-looking) shade that passes. Returns a CSS
 * `hsl(...)` string. Guarantees ≥ `target` contrast (falls back to the darkest
 * candidate if somehow nothing passes).
 */
export function optimalInk(
  hue: number,
  opts: { sat?: number; bg?: Rgb; target?: number } = {},
): string {
  const sat = opts.sat ?? 0.68;
  const bg = opts.bg ?? hslToRgb(hue, 0.3, 0.97); // matches paletteFor's --bg
  const target = opts.target ?? AA_CONTRAST;
  // Candidate space: lightness 12%…60%. Reward = lightness when it clears the
  // contrast bar, else negative-and-ordered so the darkest option wins as a
  // fallback (a guaranteed pass beats a prettier-but-failing colour).
  const candidates = Array.from({ length: 49 }, (_, i) => 12 + i); // 12..60
  const best = searchBest(candidates, (l) => {
    const ratio = contrastRatio(hslToRgb(hue, sat, l / 100), bg);
    // Any pass (reward = its lightness, so the lightest pass wins) beats any fail;
    // among fails the darkest (highest-contrast) wins as a safe fallback.
    return ratio >= target ? l : -1000 - l;
  });
  return `hsl(${hue} ${Math.round(sat * 100)}% ${best}%)`;
}
