import { describe, expect, test } from "bun:test";
import { stringsFor } from "../src/i18n/strings.ts";
import { buildAuditReport } from "../src/generate/audit.ts";
import { arbitrageScore, rankByArbitrage } from "../src/generate/arbitrage.ts";

const en = stringsFor("en");
const he = stringsFor("he");

// A broken page: no title, no viewport, http (many high-severity findings).
const broken = `<html><head></head><body><h1>x</h1><h1>y</h1><img src=a></body></html>`;
// A healthy page: title, meta, viewport, https, schema.
const healthy = `<!doctype html><html lang="en"><head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Great — Coffee in Tel Aviv</title>
  <meta name="description" content="A lovely place.">
  <meta property="og:image" content="x.jpg">
  <script type="application/ld+json">{"@type":"LocalBusiness"}</script>
  </head><body><h1>Great</h1><img src="a.jpg" alt="latte"></body></html>`;

function report(category: string, html: string, url = "http://x.example") {
  return buildAuditReport(
    { html, url, business: { id: "b", name: "Biz", category, images: [], reviews: [] } },
    en,
  );
}

describe("arbitrage layer (prospect prioritization)", () => {
  test("a broken high-value trade outranks a broken low-value one", () => {
    const lawyer = arbitrageScore(report("lawyer", broken), en);
    const restaurant = arbitrageScore(report("restaurant", broken), en);
    // Same brokenness, very different ticket → the law firm is the fatter spread.
    expect(lawyer.spread).toBeGreaterThan(restaurant.spread);
    expect(lawyer.grade).toBe("A");
    expect(restaurant.grade).toBe("C");
  });

  test("an already-healthy site is efficiently priced (thin spread)", () => {
    const brokenLawyer = arbitrageScore(report("lawyer", broken, "http://x"), en);
    const healthyLawyer = arbitrageScore(report("lawyer", healthy, "https://x"), en);
    expect(healthyLawyer.spread).toBeLessThan(brokenLawyer.spread);
    expect(healthyLawyer.gap).toBeLessThan(brokenLawyer.gap);
  });

  test("spread is a 0..100 index and deterministic", () => {
    const a = arbitrageScore(report("electrician", broken), en);
    const b = arbitrageScore(report("electrician", broken), en);
    expect(a.spread).toBe(b.spread);
    expect(a.spread).toBeGreaterThanOrEqual(0);
    expect(a.spread).toBeLessThanOrEqual(100);
    expect(a.dealValue).toBe(280); // 800 × 0.35, industry averages
  });

  test("rankByArbitrage sorts widest spread first, score as tiebreak", () => {
    const rows = [
      { arbitrage: arbitrageScore(report("restaurant", broken), en), score: 40 },
      { arbitrage: arbitrageScore(report("lawyer", broken), en), score: 40 },
      { arbitrage: arbitrageScore(report("electrician", broken), en), score: 40 },
    ];
    const ranked = rankByArbitrage(rows);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.arbitrage.spread).toBeGreaterThanOrEqual(ranked[i]!.arbitrage.spread);
    }
    // The law firm (fattest ticket) leads.
    expect(ranked[0]!.arbitrage.dealValue).toBe(600);
  });

  test("localizes the rationale (Hebrew)", () => {
    const r = arbitrageScore(report("lawyer", broken), he);
    expect(r.rationale).toContain("₪");
    expect(/[֐-׿]/.test(r.rationale)).toBe(true); // contains Hebrew
  });
});
