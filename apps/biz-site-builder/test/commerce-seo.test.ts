import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { stringsFor } from "../src/i18n/strings.ts";
import { csvCell, generateProductsCsv, starterProducts } from "../src/wordpress/woocommerce.ts";
import { generateWordPressBundle } from "../src/wordpress/bundle.ts";
import { auditSeo, formatSeoReport } from "../src/verify/seo.ts";
import { generateSite } from "../src/generate/site.ts";

const en = stringsFor("en");

const shop: Business = {
  id: "willow-wax",
  name: "Willow & Wax Candle Co.",
  category: "Home Goods Store",
  description: "Hand-poured soy candles.",
  address: "7 Franklin St, Brooklyn, NY",
  website: null,
  images: ["https://img.example/c1.jpg", "https://img.example/c2.jpg"],
  reviews: [{ author: "Nina", rating: 5, text: "Lovely" }],
  rating: 4.8,
};

describe("WooCommerce CSV", () => {
  test("csvCell quotes only when needed", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });
  test("one draft product per image, seeded from the profile", () => {
    const products = starterProducts(shop, en);
    expect(products).toHaveLength(2);
    expect(products[0]!.name).toBe("Willow & Wax Candle Co. — Item 1");
    expect(products[0]!.category).toBe("Home Goods Store");
    expect(products[0]!.image).toBe("https://img.example/c1.jpg");
  });
  test("always yields at least one starter row", () => {
    expect(starterProducts({ ...shop, images: [] }, en)).toHaveLength(1);
  });
  test("CSV has the WooCommerce importer header and draft rows", () => {
    const csv = generateProductsCsv(shop, en);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toContain("Type,SKU,Name,Published");
    expect(lines[0]).toContain("Regular price");
    // Published column (index 3) is 0 → draft.
    expect(lines[1]!.split(",")[3]).toBe("0");
    expect(lines).toHaveLength(3);
  });
  test("bundle includes products.csv only for retail (woocommerce resolved)", async () => {
    const retail = await generateWordPressBundle(shop, { strings: en });
    expect(retail.files.some((f) => f.path === "woocommerce/products.csv")).toBe(true);
    const clinic = await generateWordPressBundle(
      { ...shop, category: "Dental Clinic", name: "Bright Smile" },
      { strings: en },
    );
    expect(clinic.files.some((f) => f.path === "woocommerce/products.csv")).toBe(false);
  });
});

describe("SEO audit", () => {
  test("a generated site passes the on-page checklist", () => {
    const html = generateSite(shop, en, { baseUrl: "https://dir.example", path: "sites/w.html" });
    const report = auditSeo(html, { expectCanonical: true });
    expect(report.errors).toEqual([]);
    expect(report.passed).toBe(true);
  });
  test("flags missing title, description, h1, lang, alt, JSON-LD", () => {
    const r = auditSeo("<html><head></head><body><img src=x></body></html>");
    expect(r.passed).toBe(false);
    expect(r.errors).toContain("missing <title>");
    expect(r.errors).toContain("missing meta description");
    expect(r.errors).toContain("no <h1>");
    expect(r.errors).toContain("missing <html lang>");
    expect(r.errors.some((e) => e.includes("without alt"))).toBe(true);
    expect(r.errors).toContain("missing JSON-LD structured data");
  });
  test("flags multiple h1 and over-long title", () => {
    const html = `<html lang="en"><head><meta name="viewport" content="x"><title>${"x".repeat(80)}</title><meta name="description" content="d"><script type="application/ld+json">{}</script></head><body><h1>a</h1><h1>b</h1></body></html>`;
    const r = auditSeo(html);
    expect(r.errors).toContain("multiple <h1> (2)");
    expect(r.warnings.some((w) => w.includes(">70"))).toBe(true);
  });
  test("formatSeoReport marks pass/fail", () => {
    expect(formatSeoReport("a.html", { errors: [], warnings: [], passed: true })).toStartWith("✓");
    expect(formatSeoReport("a.html", { errors: ["x"], warnings: [], passed: false })).toContain(
      "errors: x",
    );
  });
});
