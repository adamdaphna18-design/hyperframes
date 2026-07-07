import type { Business } from "../types.ts";
import { taglineFor } from "./util.ts";
import { stringsFor, type Strings } from "../i18n/strings.ts";
import { openingHoursSpecification, parseOpeningHours } from "./hours.ts";

/**
 * Emit schema.org **LocalBusiness** JSON-LD for a business — the inverse of the
 * ladder-style scraper, which reads this same structured data. Search engines
 * (Google Rich Results, Bing) use it for local business cards, star ratings and
 * knowledge panels, so every generated site ships it. Reviews become
 * `aggregateRating` + `review[]`.
 */

/** Map a free-text category to the closest schema.org LocalBusiness subtype. */
export function schemaType(category: string | undefined): string {
  const c = (category ?? "").toLowerCase();
  const map: Array<[RegExp, string]> = [
    [/restaurant|trattoria|diner|bistro|eatery/, "Restaurant"],
    [/cafe|coffee|espresso/, "CafeOrCoffeeShop"],
    [/bar|pub|brewery|wine/, "BarOrPub"],
    [/bakery|patisserie/, "Bakery"],
    [/salon|hair|barber/, "HairSalon"],
    [/spa|beauty|nails/, "BeautySalon"],
    [/dentist|dental/, "Dentist"],
    [/doctor|clinic|medical|health/, "MedicalClinic"],
    [/yoga|gym|fitness|studio/, "HealthClub"],
    [/auto|mechanic|repair|garage/, "AutoRepair"],
    [/hotel|motel|inn|lodging/, "LodgingBusiness"],
    [/shop|store|retail|boutique|market|goods/, "Store"],
  ];
  for (const [re, type] of map) if (re.test(c)) return type;
  return "LocalBusiness";
}

/** Build the JSON-LD object (also reusable for a WordPress mu-plugin). */
export function localBusinessJsonLd(
  business: Business,
  s: Strings = stringsFor("en"),
): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType(business.category),
    name: business.name,
    description: business.description ?? taglineFor(business, s),
  };
  if (business.website) node.url = business.website;
  if (business.images.length) node.image = business.images.slice(0, 6);
  if (business.phone) node.telephone = business.phone;
  if (business.email) node.email = business.email;
  if (business.address)
    node.address = { "@type": "PostalAddress", streetAddress: business.address };
  if (business.hours) {
    node.openingHours = business.hours;
    const week = parseOpeningHours(business.hours);
    if (week) {
      const spec = openingHoursSpecification(week);
      if (spec.length) node.openingHoursSpecification = spec;
    }
  }
  if (business.location) {
    node.geo = {
      "@type": "GeoCoordinates",
      latitude: business.location.lat,
      longitude: business.location.lon,
    };
  }
  if (business.reviews.length) {
    const rated = business.reviews.filter((r) => r.rating !== undefined);
    const avg =
      business.rating ??
      (rated.length
        ? rated.reduce((sum, r) => sum + (r.rating ?? 0), 0) / rated.length
        : undefined);
    if (avg !== undefined) {
      node.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: Number(avg.toFixed(1)),
        reviewCount: business.reviews.length,
      };
    }
    node.review = business.reviews.slice(0, 10).map((r) => {
      const review: Record<string, unknown> = { "@type": "Review", reviewBody: r.text };
      if (r.author) review.author = { "@type": "Person", name: r.author };
      if (r.rating !== undefined) {
        review.reviewRating = { "@type": "Rating", ratingValue: r.rating, bestRating: 5 };
      }
      return review;
    });
  }
  return node;
}

/** Wrap a JSON-LD object in a `<script>` tag, safe to inline in HTML. */
function scriptTag(node: Record<string, unknown>): string {
  const json = JSON.stringify(node, null, 2).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

/** LocalBusiness JSON-LD as a `<script>` tag. */
export function jsonLdScript(business: Business, s: Strings = stringsFor("en")): string {
  return scriptTag(localBusinessJsonLd(business, s));
}

export interface SeoContext {
  /** Absolute site root, e.g. https://dir.example. */
  baseUrl?: string;
  /** Path to this business's page under baseUrl, e.g. sites/rosa.html. */
  path?: string;
}

/**
 * BreadcrumbList JSON-LD: Home → Category → Business. Helps search engines show
 * a breadcrumb trail in results. Absolute URLs only when a baseUrl is known.
 */
export function breadcrumbJsonLd(
  business: Business,
  ctx: SeoContext = {},
): Record<string, unknown> {
  const base = ctx.baseUrl?.replace(/\/+$/, "");
  const items: Array<Record<string, unknown>> = [{ name: "Home", url: base ?? undefined }];
  if (business.category) items.push({ name: business.category, url: undefined });
  items.push({ name: business.name, url: base && ctx.path ? `${base}/${ctx.path}` : undefined });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => {
      const el: Record<string, unknown> = { "@type": "ListItem", position: i + 1, name: it.name };
      if (it.url) el.item = it.url;
      return el;
    }),
  };
}

/** All JSON-LD for a page: LocalBusiness + BreadcrumbList, as inline scripts. */
export function jsonLdScripts(
  business: Business,
  s: Strings = stringsFor("en"),
  ctx: SeoContext = {},
): string {
  return [
    scriptTag(localBusinessJsonLd(business, s)),
    scriptTag(breadcrumbJsonLd(business, ctx)),
  ].join("\n    ");
}
