import type { Business, BusinessSource, Review } from "../types.ts";
import { slugify } from "./normalize.ts";

/**
 * A ladder-inspired server-side web fetcher + scraper (see everywall/ladder).
 * Given a URL, it fetches the page host-side with a browser/crawler user-agent
 * (which slips past many soft paywalls and JS-gated previews), rewrites relative
 * asset URLs to absolute, and extracts a business profile from meta tags,
 * schema.org JSON-LD (LocalBusiness) and og:image. This powers the "scraping"
 * pillar: point it at a directory page or a thin existing site.
 *
 * The parsing is intentionally dependency-free (regex/string based) so it runs
 * anywhere; it favours structured data (JSON-LD, OpenGraph) over brittle DOM
 * scraping.
 */

/** Crawler user-agents, à la ladder, to get the fullest server-rendered HTML. */
export const USER_AGENTS: Record<string, string> = {
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  bingbot: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  facebook: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  chrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
};

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  html: string;
}

/** Resolve a possibly-relative URL against a base (relative→absolute rewrite). */
export function absolutize(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ")
    .trim();
}

function metaContent(html: string, key: string): string | undefined {
  // Matches <meta property|name="key" content="…"> in either attribute order.
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return undefined;
}

/** Pull the first schema.org LocalBusiness-ish JSON-LD object, if present. */
export function extractJsonLd(html: string): Record<string, unknown> | undefined {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]!.trim()) as unknown;
      const nodes = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && "@graph" in parsed
          ? ((parsed as { "@graph": unknown[] })["@graph"] ?? [])
          : [parsed];
      for (const node of nodes) {
        if (node && typeof node === "object") {
          const o = node as Record<string, unknown>;
          const type = String(o["@type"] ?? "");
          // Match known business-ish @types, OR any node that carries the
          // hallmark fields of a place (covers the many LocalBusiness subtypes
          // like CafeOrCoffeeShop, HairSalon, AutoRepair, …).
          const businessType =
            /Business|Store|Shop|Restaurant|Cafe|Coffee|Bar|Bakery|Hotel|Organization|Place|Service|Dentist|Salon|Spa|Gym/i.test(
              type,
            );
          const looksLikePlace =
            "telephone" in o || "address" in o || "openingHours" in o || "aggregateRating" in o;
          if (o.name && (businessType || looksLikePlace)) {
            return o;
          }
        }
      }
    } catch {
      // Skip malformed JSON-LD blocks.
    }
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  return undefined;
}

/** Collect up to `limit` absolute image URLs from og:image + <img> tags. */
export function extractImages(html: string, base: string, limit = 8): string[] {
  const out: string[] = [];
  const push = (u: string | undefined) => {
    if (!u) return;
    const abs = absolutize(u, base);
    if (/^https?:\/\//i.test(abs) && !out.includes(abs)) out.push(abs);
  };
  push(metaContent(html, "og:image"));
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < limit) {
    const src = m[1]!;
    if (/\.(svg|gif)(\?|$)/i.test(src) || /sprite|icon|logo-?spinner|pixel|blank/i.test(src))
      continue;
    push(src);
  }
  return out.slice(0, limit);
}

/** Parse fetched HTML into a Business, preferring structured data. */
export function scrapeBusiness(page: FetchedPage): Business {
  const { html, finalUrl } = page;
  const ld = extractJsonLd(html) ?? {};
  const ldAddress = ld.address as Record<string, unknown> | string | undefined;
  const addressStr =
    typeof ldAddress === "string"
      ? ldAddress
      : ldAddress && typeof ldAddress === "object"
        ? [
            str(ldAddress.streetAddress),
            str(ldAddress.addressLocality),
            str(ldAddress.addressRegion),
            str(ldAddress.postalCode),
          ]
            .filter(Boolean)
            .join(", ")
        : undefined;

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const name =
    str(ld.name) ??
    metaContent(html, "og:site_name") ??
    metaContent(html, "og:title") ??
    (titleMatch
      ? decodeEntities(titleMatch[1]!)
          .split(/[|–—-]/)[0]!
          .trim()
      : undefined) ??
    new URL(finalUrl).hostname;

  const reviews: Review[] = [];
  const ldReviews = ld.review;
  if (Array.isArray(ldReviews)) {
    for (const r of ldReviews) {
      if (r && typeof r === "object") {
        const o = r as Record<string, unknown>;
        const body = str(o.reviewBody ?? o.description);
        if (body) {
          const author = o.author as Record<string, unknown> | string | undefined;
          const rating = (o.reviewRating as Record<string, unknown> | undefined)?.ratingValue;
          reviews.push({
            text: body,
            author: typeof author === "string" ? author : str(author?.name),
            rating: rating !== undefined ? Number(rating) || undefined : undefined,
          });
        }
      }
    }
  }

  const business: Business = {
    id: `web-${slugify(name)}-${slugify(new URL(finalUrl).hostname)}`,
    name,
    website: str(ld.url) ?? finalUrl,
    images: extractImages(html, finalUrl),
    reviews,
    source: "web",
    tags: { scrapedFrom: finalUrl },
  };
  const description =
    str(ld.description) ?? metaContent(html, "og:description") ?? metaContent(html, "description");
  if (description) business.description = description;
  if (addressStr) business.address = addressStr;
  const phone = str(ld.telephone) ?? metaContent(html, "og:phone_number");
  if (phone) business.phone = phone;
  const category =
    str(ld["@type"]) && !/Organization|Place/i.test(String(ld["@type"]))
      ? String(ld["@type"])
      : undefined;
  if (category) business.category = category;
  const agg = ld.aggregateRating as Record<string, unknown> | undefined;
  const rating = agg?.ratingValue;
  if (rating !== undefined && Number(rating)) business.rating = Number(rating);
  return business;
}

export interface WebSourceOptions {
  urls: string[];
  userAgent?: keyof typeof USER_AGENTS | string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class WebSource implements BusinessSource {
  readonly name = "web";
  constructor(private readonly opts: WebSourceOptions) {
    if (!opts.urls.length) throw new Error("WebSource needs at least one URL.");
  }

  async fetchPage(url: string): Promise<FetchedPage | null> {
    const doFetch = this.opts.fetchImpl ?? fetch;
    const ua = USER_AGENTS[this.opts.userAgent ?? "googlebot"] ?? String(this.opts.userAgent);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 12000);
    try {
      const res = await doFetch(url, {
        headers: { "User-Agent": ua, "Accept-Language": "en,he;q=0.8", Accept: "text/html" },
        redirect: "follow",
        signal: controller.signal,
      });
      const html = await res.text();
      return { url, finalUrl: res.url || url, status: res.status, html };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async load(): Promise<Business[]> {
    const pages = await Promise.all(this.opts.urls.map((u) => this.fetchPage(u)));
    return pages.filter((p): p is FetchedPage => p !== null && p.status < 400).map(scrapeBusiness);
  }
}

/** Parse `web:https://a.com,https://b.com;ua=googlebot`. */
export function parseWebSpec(spec: string): WebSourceOptions {
  let ua: string | undefined;
  let rest = spec;
  const uaMatch = spec.match(/;ua=([^;,\s]+)\s*$/);
  if (uaMatch) {
    ua = uaMatch[1];
    rest = spec.slice(0, uaMatch.index);
  }
  const urls = rest
    .split(/[,\s]+/)
    .map((u) => u.trim())
    .filter(Boolean);
  const opts: WebSourceOptions = { urls };
  if (ua) opts.userAgent = ua;
  return opts;
}
