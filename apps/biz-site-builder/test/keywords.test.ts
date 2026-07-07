import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { stringsFor } from "../src/i18n/strings.ts";
import { extractKeywords, rake } from "../src/generate/keywords.ts";
import { localBusinessJsonLd } from "../src/generate/schema.ts";
import { headMeta } from "../src/generate/meta.ts";
import { generateSite } from "../src/generate/site.ts";
import { generateIndexJson } from "../src/generate/listing.ts";

const en = stringsFor("en");

const cafe: Business = {
  id: "grind",
  name: "The Daily Grind Coffee",
  category: "Coffee Shop",
  description:
    "Small-batch roastery and neighbourhood cafe serving specialty espresso and single-origin pour-over coffee.",
  address: "44 Grand St, Tel Aviv, Israel",
  website: null,
  images: ["https://img.example/a.jpg"],
  reviews: [],
};

describe("RAKE", () => {
  test("extracts multi-word phrases ranked by score", () => {
    const phrases = rake(cafe.description!).map((p) => p.phrase);
    expect(phrases).toContain("specialty espresso");
    expect(phrases).toContain("small-batch roastery");
    // Stopwords ('and', 'serving') split phrases, so they never appear.
    expect(phrases.join(" ")).not.toMatch(/\bserving\b/);
  });
  test("is deterministic and drops long phrases", () => {
    expect(rake(cafe.description!)).toEqual(rake(cafe.description!));
    expect(rake("one two three four five", 3).every((p) => p.phrase.split(" ").length <= 3)).toBe(
      true,
    );
  });
});

describe("extractKeywords", () => {
  const kw = extractKeywords(cafe, en);
  test("primary leads with category + RAKE terms", () => {
    expect(kw.primary[0]).toBe("Coffee Shop");
    expect(kw.primary).toContain("Specialty Espresso");
  });
  test("long-tail seeds the city", () => {
    expect(kw.longTail).toContain("Coffee Shop in Tel Aviv");
    expect(kw.longTail).toContain("best Coffee Shop in Tel Aviv");
  });
  test("Hebrew falls back to seed phrases (no English RAKE)", () => {
    const he = extractKeywords({ ...cafe, name: "קפה נמל" }, stringsFor("he"));
    expect(he.longTail.some((k) => k.includes("תל אביב") || k.includes("Tel Aviv"))).toBe(true);
  });
});

describe("wiring", () => {
  test("keywords flow into LocalBusiness JSON-LD", () => {
    const node = localBusinessJsonLd(cafe, en, { keywords: ["a", "b"] });
    expect(node.keywords).toBe("a, b");
  });
  test("keywords render as a <meta name=keywords> tag", () => {
    const html = headMeta(cafe, { keywords: ["Coffee Shop", "Specialty Espresso"] });
    expect(html).toContain('name="keywords" content="Coffee Shop, Specialty Espresso"');
  });
  test("static site emits keyword meta + descriptive image alt", () => {
    const html = generateSite(cafe, en, { baseUrl: "https://d.example", path: "sites/g.html" });
    expect(html).toContain('name="keywords"');
    expect(html).toContain('alt="The Daily Grind Coffee — Coffee Shop — in Tel Aviv"');
  });
  test("index.json carries a per-business keyword report", () => {
    const json = JSON.parse(
      generateIndexJson([
        { business: cafe, status: { hasWebsite: false, reason: "x" }, locale: "en" },
      ]),
    );
    expect(Array.isArray(json[0].keywords)).toBe(true);
    expect(json[0].keywords).toContain("Coffee Shop in Tel Aviv");
  });
});
