import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { stringsFor } from "../src/i18n/strings.ts";
import { localSeoHtml, localSeoRoadmap } from "../src/generate/localseo.ts";

const en = stringsFor("en");
const he = stringsFor("he");

function biz(p: Partial<Business>): Business {
  return { id: "b", name: "מספרת רוטשילד", images: [], reviews: [], ...p };
}

const badHtml = `<html><head><script src="/jquery-1.11.min.js"></script></head><body><img src=a></body></html>`;
const goodHtml = `<!doctype html><html lang="en"><head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Great Cafe — Coffee in Tel Aviv</title>
  <meta name="description" content="A lovely cafe.">
  <script type="application/ld+json">{"@type":"LocalBusiness","name":"Great Cafe"}</script>
  </head><body><h1>Great Cafe</h1><a href="https://www.google.com/maps">map</a><img src="a.jpg" alt="latte"></body></html>`;

describe("local SEO roadmap (the synthesis layer)", () => {
  test("leads with quick wins (high impact, low effort), then priority order", () => {
    const r = localSeoRoadmap(
      {
        business: biz({ address: "רוטשילד 40", phone: "03-1" }),
        html: badHtml,
        url: "http://x.example",
      },
      en,
    );
    expect(r.score).toBeLessThan(60);
    // Quick wins are all high-impact + easy and not yet done.
    for (const q of r.quickWins) {
      expect(q.impact).toBe(3);
      expect(q.effort).toBe(1);
      expect(q.done).toBe(false);
    }
    expect(r.quickWins.map((q) => q.key)).toContain("https");
    // The full roadmap is sorted by priority descending.
    for (let i = 1; i < r.roadmap.length; i++) {
      expect(r.roadmap[i - 1]!.priority).toBeGreaterThanOrEqual(r.roadmap[i]!.priority);
    }
  });

  test("a healthy site scores high and surfaces strengths", () => {
    const r = localSeoRoadmap(
      {
        business: biz({ address: "a", phone: "1", hours: "9-5", rating: 4.8 }),
        html: goodHtml,
        url: "https://cafe.example",
      },
      en,
    );
    expect(r.score).toBeGreaterThan(75);
    expect(r.strengths.map((x) => x.key)).toEqual(
      expect.arrayContaining(["https", "mobile", "title", "schema", "nap"]),
    );
  });

  test("score is deterministic and 0–100", () => {
    const input = { business: biz({}), html: badHtml, url: "http://x" };
    expect(localSeoRoadmap(input, en).score).toBe(localSeoRoadmap(input, en).score);
    expect(localSeoRoadmap(input, en).score).toBeGreaterThanOrEqual(0);
  });

  test("renders a localized (RTL) report with a Quick Wins section", () => {
    const html = localSeoHtml(
      {
        business: biz({ category: "מספרה", phone: "03-1" }),
        html: badHtml,
        url: "http://x.example",
      },
      he,
      { brand: "סטודיו דנה" },
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("ניצחונות מהירים"); // Quick wins
    expect(html).toContain("סטודיו דנה");
  });
});
