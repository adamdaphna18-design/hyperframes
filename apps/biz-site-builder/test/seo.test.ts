import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { stringsFor } from "../src/i18n/strings.ts";
import {
  hoursTableHtml,
  openingHoursSpecification,
  parseOpeningHours,
} from "../src/generate/hours.ts";
import { cityOf, headMeta, seoDescription, seoTitle } from "../src/generate/meta.ts";
import { breadcrumbJsonLd, localBusinessJsonLd } from "../src/generate/schema.ts";
import { generateSite } from "../src/generate/site.ts";

const en = stringsFor("en");

const cafe: Business = {
  id: "nine",
  name: "Cafe Nine",
  category: "Coffee Shop",
  description: "Small-batch roastery and neighbourhood cafe.",
  address: "9 Bean St, Tel Aviv, Israel",
  phone: "+972 3-555-0000",
  website: null,
  images: ["https://img.example/hero.jpg"],
  reviews: [{ author: "Sam", rating: 5, text: "Great espresso" }],
  rating: 4.8,
  hours: "Mo-Fr 08:00-18:00; Sa 09:00-14:00; Su off",
};

describe("opening_hours parsing", () => {
  test("parses day ranges, lists and off", () => {
    const week = parseOpeningHours("Mo-Fr 08:00-18:00; Sa 09:00-14:00; Su off")!;
    expect(week[0]).toEqual([{ open: "08:00", close: "18:00" }]); // Monday
    expect(week[5]).toEqual([{ open: "09:00", close: "14:00" }]); // Saturday
    expect(week[6]).toEqual([]); // Sunday off
  });
  test("parses 24/7", () => {
    const week = parseOpeningHours("24/7")!;
    expect(week[3]).toEqual([{ open: "00:00", close: "24:00" }]);
  });
  test("parses multiple ranges per day", () => {
    const week = parseOpeningHours("Mo 08:00-12:00,13:00-18:00")!;
    expect(week[0]).toHaveLength(2);
  });
  test("returns null for unsupported features", () => {
    expect(parseOpeningHours("Mo-Fr sunrise-sunset")).toBeNull();
    expect(parseOpeningHours("PH off")).toBeNull();
  });
  test("renders a localized table with time tags and closed", () => {
    const html = hoursTableHtml(parseOpeningHours(cafe.hours!)!, en);
    expect(html).toContain('<th scope="row">Monday</th>');
    expect(html).toContain("<time>08:00</time>");
    expect(html).toContain("Closed");
    expect(hoursTableHtml(parseOpeningHours(cafe.hours!)!, stringsFor("he"))).toContain("שני");
  });
  test("emits schema.org OpeningHoursSpecification grouping identical days", () => {
    const spec = openingHoursSpecification(parseOpeningHours(cafe.hours!)!);
    const weekdays = spec.find(
      (x) => Array.isArray(x.dayOfWeek) && (x.dayOfWeek as string[]).includes("Monday"),
    )!;
    expect(weekdays.dayOfWeek).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    expect(weekdays.opens).toBe("08:00");
  });
  test("openingHoursSpecification flows into LocalBusiness JSON-LD", () => {
    const node = localBusinessJsonLd(cafe, en);
    expect(Array.isArray(node.openingHoursSpecification)).toBe(true);
  });
});

describe("keyword-rich title & description", () => {
  test("cityOf extracts the city", () => {
    expect(cityOf(cafe)).toBe("Tel Aviv");
  });
  test("title is {name} — {category} in {city} | {brand}", () => {
    const t = seoTitle(cafe, { brand: "LocalDir" });
    expect(t).toContain("Cafe Nine");
    expect(t).toContain("Coffee Shop in Tel Aviv");
    expect(t).toContain("| LocalDir");
  });
  test("description is capped and from the profile", () => {
    expect(seoDescription(cafe)).toContain("roastery");
    expect(seoDescription(cafe).length).toBeLessThanOrEqual(155);
  });
});

describe("head meta (Open Graph + Twitter + canonical)", () => {
  const html = headMeta(cafe, {
    baseUrl: "https://dir.example",
    path: "sites/nine.html",
    brand: "LocalDir",
  });
  test("emits Open Graph tags", () => {
    expect(html).toContain('property="og:type" content="business.business"');
    expect(html).toContain('property="og:image" content="https://img.example/hero.jpg"');
    expect(html).toContain('property="og:url" content="https://dir.example/sites/nine.html"');
  });
  test("emits Twitter Card tags", () => {
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('name="twitter:title"');
  });
  test("emits canonical + robots", () => {
    expect(html).toContain('<link rel="canonical" href="https://dir.example/sites/nine.html" />');
    expect(html).toContain('name="robots" content="index, follow"');
  });
});

describe("breadcrumbs", () => {
  test("Home → Category → Business with absolute URLs", () => {
    const bc = breadcrumbJsonLd(cafe, { baseUrl: "https://dir.example", path: "sites/nine.html" });
    const items = bc.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0]!.name).toBe("Home");
    expect(items[1]!.name).toBe("Coffee Shop");
    expect(items[2]!.item).toBe("https://dir.example/sites/nine.html");
  });
});

describe("site integration", () => {
  const html = generateSite(cafe, en, {
    baseUrl: "https://dir.example",
    path: "sites/nine.html",
    brand: "LocalDir",
  });
  test("head carries title, OG, canonical, LocalBusiness + Breadcrumb JSON-LD", () => {
    expect(html).toContain("<title>Cafe Nine — Coffee Shop in Tel Aviv | LocalDir</title>");
    expect(html).toContain('property="og:type"');
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('"@type": "BreadcrumbList"');
    expect(html).toContain('"@type": "CafeOrCoffeeShop"');
  });
  test("contact section shows a structured hours table", () => {
    expect(html).toContain('table class="hours"');
    expect(html).toContain("<time>08:00</time>");
  });
});
