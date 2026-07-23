import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { stringsFor } from "../src/i18n/strings.ts";
import { analyticsSnippet, hasAnalytics } from "../src/generate/analytics.ts";
import { ogImageFilename, ogImageSvg } from "../src/generate/ogimage.ts";
import { cuisineOf, localBusinessJsonLd } from "../src/generate/schema.ts";
import { generateSite } from "../src/generate/site.ts";
import { generateWordPressBundle } from "../src/wordpress/bundle.ts";

const en = stringsFor("en");

const rosa: Business = {
  id: "rosa",
  name: "Rosa's Trattoria",
  category: "Italian Restaurant",
  description: "Family-run trattoria.",
  address: "512 Vine St, Brooklyn, NY",
  phone: "+1 718-555-0142",
  website: null,
  images: ["https://img.example/a.jpg"],
  reviews: [{ author: "Maria", rating: 5, text: "Best pasta" }],
  rating: 4.7,
};

describe("analytics", () => {
  test("empty when unconfigured", () => {
    expect(hasAnalytics({})).toBe(false);
    expect(analyticsSnippet(rosa, {})).toBe("");
  });
  test("GA4 emits gtag + a view_item event with business params", () => {
    const snip = analyticsSnippet(rosa, { ga4: "G-ABC123" });
    expect(snip).toContain("googletagmanager.com/gtag/js?id=G-ABC123");
    expect(snip).toContain("gtag('config', 'G-ABC123')");
    expect(snip).toContain("business_name: 'Rosa\\'s Trattoria'");
    expect(snip).toContain("city: 'Brooklyn'");
  });
  test("Plausible emits its script with the domain", () => {
    expect(analyticsSnippet(rosa, { plausible: "rosas.example" })).toContain(
      'data-domain="rosas.example"',
    );
  });
});

describe("dynamic OG image", () => {
  const svg = ogImageSvg(rosa, en);
  test("is a 1200x630 SVG with name, initials and rating", () => {
    expect(svg).toContain('width="1200" height="630"');
    expect(svg).toContain("Rosa"); // wrapped name tspans
    expect(svg).toContain(">RT<"); // initials badge
    expect(svg).toContain("4.7");
  });
  test("escapes XML and is RTL-aware", () => {
    const evil = ogImageSvg({ ...rosa, name: "A&B <Co>" }, en);
    expect(evil).toContain("A&amp;B &lt;Co&gt;");
    expect(ogImageSvg(rosa, stringsFor("he"))).toContain('text-anchor="end"');
  });
  test("filename derives from the slug", () => {
    expect(ogImageFilename(rosa)).toMatch(/^rosa-s-trattoria-[a-z0-9]+\.og\.svg$/);
  });
});

describe("servesCuisine", () => {
  test("infers cuisine from category for food businesses", () => {
    expect(cuisineOf(rosa)).toEqual(["Italian"]);
    expect(localBusinessJsonLd(rosa, en).servesCuisine).toEqual(["Italian"]);
  });
  test("reads the OSM cuisine tag", () => {
    const b: Business = { ...rosa, category: "Restaurant", tags: { cuisine: "pizza;italian" } };
    expect(cuisineOf(b)).toEqual(["pizza", "italian"]);
  });
  test("no servesCuisine for non-food businesses", () => {
    const shop: Business = { ...rosa, category: "Book Store" };
    expect(localBusinessJsonLd(shop, en).servesCuisine).toBeUndefined();
  });
});

describe("integration", () => {
  test("static site uses the branded OG image + analytics when configured", () => {
    const html = generateSite(rosa, en, {
      baseUrl: "https://dir.example",
      path: "sites/rosa.html",
      ogImage: "https://dir.example/sites/rosa.og.svg",
      analytics: { ga4: "G-XYZ" },
    });
    expect(html).toContain('property="og:image" content="https://dir.example/sites/rosa.og.svg"');
    expect(html).toContain("gtag/js?id=G-XYZ");
  });
  test("WordPress bundle ships an OG asset and an analytics mu-plugin when configured", async () => {
    const bundle = await generateWordPressBundle(rosa, {
      strings: en,
      analytics: { plausible: "x.example" },
    });
    const paths = bundle.files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith("assets/") && p.endsWith(".og.svg"))).toBe(true);
    expect(paths.some((p) => p.endsWith("-analytics.php"))).toBe(true);
  });
  test("no analytics mu-plugin when unconfigured", async () => {
    const bundle = await generateWordPressBundle(rosa, { strings: en });
    expect(bundle.files.some((f) => f.path.endsWith("-analytics.php"))).toBe(false);
  });
});
