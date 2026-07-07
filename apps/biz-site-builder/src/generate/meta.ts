import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";
import { stringsFor } from "../i18n/strings.ts";
import { esc, taglineFor } from "./util.ts";

/**
 * On-page SEO + social head metadata: keyword-rich <title>/description, Open
 * Graph (ogp.me), Twitter Cards, canonical, hreflang and robots. Emitted into
 * the static site <head> and, for WordPress, a mu-plugin in wp_head. All values
 * derive from the scraped business data — no external calls.
 */

export interface MetaContext {
  locale?: Strings;
  /** Absolute site root, e.g. https://dir.example. */
  baseUrl?: string;
  /** Path to this business's page under baseUrl, e.g. sites/rosa.html. */
  path?: string;
  /** Brand suffix for titles, e.g. "MyDirectory". */
  brand?: string;
  /** The he/en counterpart path for hreflang, if a translated page exists. */
  altPath?: string;
}

/** Best-effort city extraction from a "street, city, region" address. */
export function cityOf(business: Business): string | undefined {
  const parts = (business.address ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts[parts.length >= 3 ? parts.length - 2 : parts.length - 1];
  return undefined;
}

/** Keyword-rich page title: "{name} — {category} in {city} | {brand}". */
export function seoTitle(business: Business, ctx: MetaContext = {}): string {
  const s = ctx.locale ?? stringsFor("en");
  const city = cityOf(business);
  const parts = [business.name];
  if (business.category && city)
    parts.push(`${business.category} ${s.code === "he" ? "ב" : "in "}${city}`.trim());
  else if (business.category) parts.push(business.category);
  let title = parts.join(" — ");
  if (ctx.brand) title += ` | ${ctx.brand}`;
  return title.slice(0, 70);
}

/** Meta description from description/tagline + city, capped at ~155 chars. */
export function seoDescription(business: Business, ctx: MetaContext = {}): string {
  const s = ctx.locale ?? stringsFor("en");
  const base = business.description ?? taglineFor(business, s);
  return base.replace(/\s+/g, " ").trim().slice(0, 155);
}

function tag(attr: "property" | "name", key: string, content: string): string {
  return `<meta ${attr}="${key}" content="${esc(content)}" />`;
}

/**
 * The full head-meta block (excluding <title>, which the caller renders). Returns
 * newline-joined tags ready to drop into <head>.
 */
export function headMeta(business: Business, ctx: MetaContext = {}): string {
  const s = ctx.locale ?? stringsFor("en");
  const desc = seoDescription(business, ctx);
  const image = business.images[0];
  const base = ctx.baseUrl?.replace(/\/+$/, "");
  const canonical = base && ctx.path ? `${base}/${ctx.path}` : undefined;

  const lines: string[] = [
    tag("name", "description", desc),
    tag("name", "robots", "index, follow"),
    // Open Graph (ogp.me)
    tag("property", "og:type", "business.business"),
    tag("property", "og:title", seoTitle(business, ctx)),
    tag("property", "og:description", desc),
    tag("property", "og:locale", s.code === "he" ? "he_IL" : "en_US"),
    // Twitter Cards
    tag("name", "twitter:card", image ? "summary_large_image" : "summary"),
    tag("name", "twitter:title", seoTitle(business, ctx)),
    tag("name", "twitter:description", desc),
  ];
  if (business.name) lines.push(tag("property", "og:site_name", business.name));
  if (image) {
    lines.push(tag("property", "og:image", image));
    lines.push(tag("name", "twitter:image", image));
  }
  if (canonical) {
    lines.push(tag("property", "og:url", canonical));
    lines.push(`<link rel="canonical" href="${esc(canonical)}" />`);
  }
  // hreflang for the en/he counterpart, when both exist.
  if (base && ctx.path && ctx.altPath) {
    const here = s.code === "he" ? "he" : "en";
    const other = here === "he" ? "en" : "he";
    lines.push(`<link rel="alternate" hreflang="${here}" href="${esc(`${base}/${ctx.path}`)}" />`);
    lines.push(
      `<link rel="alternate" hreflang="${other}" href="${esc(`${base}/${ctx.altPath}`)}" />`,
    );
  }
  return lines.join("\n    ");
}
