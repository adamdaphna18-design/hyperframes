import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";
import { slugify } from "../sources/normalize.ts";

export { slugify };

/** Escape text for safe interpolation into HTML element content/attributes. */
export function esc(input: string | undefined | null): string {
  if (input === undefined || input === null) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape a string for embedding inside a single-quoted JS string literal. */
export function jsStr(input: string | undefined | null): string {
  if (input === undefined || input === null) return "";
  return String(input)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")
    .replace(/</g, "\\u003c");
}

/** Deterministic 32-bit hash (FNV-1a) — used for stable per-business palettes. */
export function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Palette {
  hue: number;
  accent: string;
  accentDeep: string;
  /** Darkened accent guaranteed to meet WCAG AA (4.5:1) on a white background,
   *  for text/links/icons — low lightness so even bright hues stay legible. */
  accentInk: string;
  ink: string;
  bg: string;
  surface: string;
}

/** A stable, tasteful palette derived from the business name. */
export function paletteFor(business: Business): Palette {
  const hue = hash(business.name) % 360;
  return {
    hue,
    accent: `hsl(${hue} 82% 56%)`,
    accentDeep: `hsl(${hue} 74% 42%)`,
    accentInk: `hsl(${hue} 68% 25%)`,
    ink: "#12141a",
    bg: `hsl(${hue} 30% 97%)`,
    surface: "#ffffff",
  };
}

/**
 * A clean, collision-resistant output slug: the business name plus a short
 * stable hash of its id (so two "Joe's Pizza" don't overwrite each other).
 */
export function outputSlug(business: Business): string {
  const suffix = hash(business.id).toString(36).slice(0, 6);
  return `${slugify(business.name)}-${suffix}`;
}

export function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters =
    (words[0]?.[0] ?? "") + (words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "");
  return letters.toUpperCase() || "•";
}

/** A short marketing tagline derived from available profile fields, localised. */
export function taglineFor(business: Business, s: Strings): string {
  if (business.description) {
    const firstSentence = business.description.split(/(?<=[.!?])\s/)[0]?.trim();
    if (firstSentence && firstSentence.length <= 90) return firstSentence;
    return business.description.slice(0, 88).trim() + "…";
  }
  const where =
    business.address?.split(",").slice(-2, -1)[0]?.trim() ??
    business.address?.split(",")[0]?.trim();
  if (business.category && where) return s.categoryIn(business.category, where);
  if (business.category) return s.localCategory(business.category);
  if (where) return s.proudlyServing(where);
  return s.nowOpen;
}

export function bestReview(business: Business) {
  if (!business.reviews.length) return undefined;
  return [...business.reviews].sort(
    (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.text.length - a.text.length,
  )[0];
}

export function stars(rating: number | undefined): string {
  if (rating === undefined) return "";
  const full = Math.round(rating);
  return "★★★★★☆☆☆☆☆".slice(5 - full, 10 - full);
}
