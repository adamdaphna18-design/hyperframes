import type { Business } from "../types.ts";

/**
 * Resolve which WordPress.org plugins a business's site should ship with.
 *
 * Plugins are referenced by their wordpress.org directory slug — the same slug
 * used by `wp plugin install <slug>`, by wpackagist (`wpackagist-plugin/<slug>`),
 * and by the WP.org API. A curated category map gives deterministic, offline
 * results; an optional live query to the WP.org plugins API can augment it.
 */

export interface ResolvedPlugin {
  slug: string;
  reason: string;
}

/** Always-on plugins every generated business site gets. */
const BASE_PLUGINS: ResolvedPlugin[] = [
  { slug: "wordpress-seo", reason: "SEO (Yoast) — local business discoverability" },
  { slug: "contact-form-7", reason: "contact form" },
  { slug: "wp-super-cache", reason: "page caching / performance" },
];

/** category keyword → extra plugin slugs. */
const CATEGORY_PLUGINS: Array<{ match: RegExp; plugin: ResolvedPlugin }> = [
  {
    match: /restaurant|food|cafe|coffee|trattoria|pizz|bakery|bar|diner|deli/i,
    plugin: { slug: "restaurant-reservations", reason: "table reservations" },
  },
  {
    match: /shop|store|retail|boutique|goods|market|candle|book/i,
    plugin: { slug: "woocommerce", reason: "online store / e-commerce" },
  },
  {
    match:
      /salon|spa|barber|beauty|nails|hair|yoga|studio|fitness|gym|dental|dentist|clinic|therap/i,
    plugin: { slug: "simply-schedule-appointments", reason: "online appointment booking" },
  },
];

/** WP.org plugins API query URL (action=query_plugins). */
export function pluginSearchUrl(term: string, perPage = 3): string {
  const params = new URLSearchParams({
    action: "query_plugins",
    "request[search]": term,
    "request[per_page]": String(perPage),
  });
  return `https://api.wordpress.org/plugins/info/1.2/?${params.toString()}`;
}

/**
 * Deterministic, offline resolution from the curated map. Reviews add a
 * testimonials plugin; the category adds a domain plugin.
 */
export function resolvePluginsStatic(business: Business): ResolvedPlugin[] {
  const out: ResolvedPlugin[] = [...BASE_PLUGINS];
  const seen = new Set(out.map((p) => p.slug));
  const add = (p: ResolvedPlugin) => {
    if (!seen.has(p.slug)) {
      seen.add(p.slug);
      out.push(p);
    }
  };

  if (business.reviews.length) {
    add({ slug: "strong-testimonials", reason: "display community reviews" });
  }
  const haystack = `${business.category ?? ""} ${business.name}`;
  for (const { match, plugin } of CATEGORY_PLUGINS) {
    if (match.test(haystack)) add(plugin);
  }
  return out;
}

/**
 * Optionally augment the static resolution with a live WP.org search for the
 * business category (best-effort; failures are ignored). Injected fetch keeps it
 * testable and offline by default.
 */
export async function resolvePlugins(
  business: Business,
  opts: { fetchImpl?: typeof fetch; live?: boolean } = {},
): Promise<ResolvedPlugin[]> {
  const resolved = resolvePluginsStatic(business);
  if (!opts.live || !business.category) return resolved;

  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(pluginSearchUrl(business.category, 1));
    if (!res.ok) return resolved;
    const json = (await res.json()) as { plugins?: Array<{ slug?: string; name?: string }> };
    const top = json.plugins?.[0];
    if (top?.slug && !resolved.some((p) => p.slug === top.slug)) {
      resolved.push({ slug: top.slug, reason: `top WP.org match for "${business.category}"` });
    }
  } catch {
    // Best-effort; keep the deterministic set.
  }
  return resolved;
}
