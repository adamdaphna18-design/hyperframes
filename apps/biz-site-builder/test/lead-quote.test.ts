import { describe, expect, test } from "bun:test";
import type { Business, WebsiteStatus } from "../src/types.ts";
import { stringsFor } from "../src/i18n/strings.ts";
import { leadTier, scoreLead } from "../src/generate/lead.ts";
import { generateQuote, quoteHtml, siteTypeFor } from "../src/generate/quote.ts";

const en = stringsFor("en");
const he = stringsFor("he");
const noSite: WebsiteStatus = { hasWebsite: false, reason: "none" };
const hasSite: WebsiteStatus = { hasWebsite: true, url: "https://x.example/", reason: "owned" };

function biz(p: Partial<Business>): Business {
  return { id: "b", name: "Biz", website: null, images: [], reviews: [], ...p };
}

describe("lead scoring", () => {
  test("rewards no-website + rating + reviews + reachability", () => {
    const hot = scoreLead(
      biz({
        rating: 4.8,
        reviews: Array(150).fill({ text: "great" }),
        phone: "1",
        address: "a",
      }),
      noSite,
    );
    expect(hot).toBe(100);
    expect(leadTier(hot)).toBe("hot");
  });
  test("a bare business with an existing site scores lower", () => {
    const cold = scoreLead(biz({}), hasSite);
    expect(cold).toBeLessThan(60);
    expect(leadTier(cold)).toBe("cold");
  });
  test("is deterministic and clamped to 0–100", () => {
    const b = biz({ rating: 5, reviews: Array(300).fill({ text: "x" }), phone: "1", address: "a" });
    expect(scoreLead(b, noSite)).toBe(scoreLead(b, noSite));
    expect(scoreLead(b, noSite)).toBeLessThanOrEqual(100);
  });
});

describe("quote generation", () => {
  test("maps categories to site types (EN + HE keywords)", () => {
    expect(siteTypeFor("Book Store")).toBe("ecommerce");
    expect(siteTypeFor("חנות בגדים")).toBe("ecommerce");
    expect(siteTypeFor("Italian Restaurant")).toBe("business");
    expect(siteTypeFor("מסעדה")).toBe("business");
    expect(siteTypeFor("Fitness Studio")).toBe("custom");
    expect(siteTypeFor(undefined)).toBe("business");
  });
  test("prices scale with review volume and round to ₪100", () => {
    const established = generateQuote(
      biz({ category: "Restaurant", reviews: Array(150).fill({ text: "x" }) }),
      noSite,
      en,
    );
    const quiet = generateQuote(biz({ category: "Restaurant", reviews: [] }), noSite, en);
    expect(established.priceMin).toBeGreaterThan(quiet.priceMin);
    expect(established.priceMin % 100).toBe(0);
    expect(established.currency).toBe("₪");
  });
  test("carries the lead score and localizes the site-type name", () => {
    const q = generateQuote(biz({ category: "מסעדה", phone: "1" }), noSite, he);
    expect(q.siteTypeName).toBe("אתר תדמית עסקי");
    expect(q.includes[0]).toContain("עיצוב");
    expect(q.leadScore).toBeGreaterThan(0);
  });
});

describe("quote HTML", () => {
  test("renders a self-contained localized document (RTL for Hebrew)", () => {
    const b = biz({ name: "מסעדת הים", category: "מסעדה" });
    const q = generateQuote(b, noSite, he);
    const html = quoteHtml(b, q, he);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("הצעת מחיר לבניית אתר");
    expect(html).toContain("מסעדת הים");
    expect(html).toContain("₪");
  });
  test("escapes untrusted business fields", () => {
    const b = biz({ name: "A&B <script>", category: "Restaurant" });
    const html = quoteHtml(b, generateQuote(b, noSite, en), en);
    expect(html).toContain("A&amp;B &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
