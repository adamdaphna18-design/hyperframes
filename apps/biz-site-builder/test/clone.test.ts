import { describe, expect, test } from "bun:test";
import { extractBrandColor, scrapeBusiness } from "../src/sources/web.ts";
import { hueOfHex, paletteFor } from "../src/generate/util.ts";
import { generateTheme } from "../src/wordpress/theme.ts";
import { stringsFor } from "../src/i18n/strings.ts";

const en = stringsFor("en");

describe("brand-color cloning", () => {
  test("prefers an explicit theme-color meta", () => {
    const html = `<html><head><meta name="theme-color" content="#1e73be"></head><body></body></html>`;
    expect(extractBrandColor(html)).toBe("#1e73be");
  });
  test("expands #rgb and lowercases", () => {
    expect(extractBrandColor(`<meta name="theme-color" content="#F0A">`)).toBe("#ff00aa");
  });
  test("falls back to the most frequent non-neutral hex in CSS", () => {
    const html = `<style>
      body{color:#111111;background:#ffffff}
      .btn{background:#c0392b} .a{color:#c0392b} .b{border:1px solid #c0392b}
      .grey{color:#888888}
    </style>`;
    expect(extractBrandColor(html)).toBe("#c0392b"); // brand red wins over black/white/grey
  });
  test("returns undefined when the page has no real colour", () => {
    expect(extractBrandColor(`<style>body{color:#000;background:#fff}</style>`)).toBeUndefined();
  });

  test("scrapeBusiness captures the brand colour", () => {
    const html = `<html><head><title>Blue Co</title><meta name="theme-color" content="#1e73be"></head><body></body></html>`;
    const b = scrapeBusiness({
      html,
      url: "https://blue.example/",
      finalUrl: "https://blue.example/",
      status: 200,
    });
    expect(b.brandColor).toBe("#1e73be");
  });
});

describe("palette anchors to the cloned colour", () => {
  test("hueOfHex computes hue; grey → undefined", () => {
    expect(hueOfHex("#ff0000")).toBe(0);
    expect(hueOfHex("#00ff00")).toBe(120);
    expect(hueOfHex("#0000ff")).toBe(240);
    expect(hueOfHex("#808080")).toBeUndefined();
  });
  test("a cloned brand colour drives the theme, not the name hash", () => {
    const cloned = paletteFor({
      id: "1",
      name: "Anything",
      brandColor: "#1e73be",
      images: [],
      reviews: [],
    });
    const byName = paletteFor({ id: "1", name: "Anything", images: [], reviews: [] });
    const hue = hueOfHex("#1e73be")!;
    expect(cloned.accent).toContain(`hsl(${hue}`);
    expect(cloned.accent).not.toBe(byName.accent); // identity comes from the source, not the name
  });
  test("the WordPress theme.json accent reflects the cloned hue", () => {
    const theme = generateTheme(
      { id: "1", name: "Clone Co", brandColor: "#1e73be", images: [], reviews: [] },
      en,
    );
    const json = JSON.parse(theme.find((f) => f.path.endsWith("theme.json"))!.content);
    const accent = json.settings.color.palette.find((c: { slug: string }) => c.slug === "accent")
      .color as string;
    // Blue source → blue-ish accent (blue channel dominant).
    const b = parseInt(accent.slice(5, 7), 16);
    const r = parseInt(accent.slice(1, 3), 16);
    expect(b).toBeGreaterThan(r);
  });
});
