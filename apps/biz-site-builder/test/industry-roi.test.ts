import { describe, expect, test } from "bun:test";
import { stringsFor } from "../src/i18n/strings.ts";
import { getIndustryProfile } from "../src/generate/industry.ts";
import { estimateRoi } from "../src/generate/roi.ts";

const en = stringsFor("en");
const he = stringsFor("he");

describe("industry profiles", () => {
  test("covers the trade professions with deal size, close rate and features", () => {
    for (const cat of ["Electrician", "Plumber", "Handyman"]) {
      const p = getIndustryProfile({ category: cat }, en);
      expect(p.avgDealSize).toBeGreaterThan(0);
      expect(p.conversionRate).toBeGreaterThan(0);
      expect(p.conversionRate).toBeLessThanOrEqual(1);
      expect(p.requiredFeatures.length).toBeGreaterThan(0);
      expect(p.closingPitch.length).toBeGreaterThan(0);
      expect(p.painPoint.length).toBeGreaterThan(0);
    }
  });
  test("matches EN and Hebrew category keywords", () => {
    expect(getIndustryProfile({ category: "חשמלאי" }, he).key).toBe("electrician");
    expect(getIndustryProfile({ category: "שרברב" }, he).displayName).toBe("שרברב");
    expect(getIndustryProfile({ category: "Italian Restaurant" }, en).key).toBe("restaurant");
  });
  test("falls back to a generic profile for unknown categories", () => {
    const p = getIndustryProfile({ category: "Widget Foundry" }, en);
    expect(p.key).toBe("general");
    expect(p.requiredFeatures.length).toBeGreaterThan(0);
  });
  test("shares one source of truth with painpoints (localized)", () => {
    expect(getIndustryProfile({ category: "מספרה" }, he).painPoint).toContain("תורים");
  });
});

describe("ROI estimate", () => {
  test("is pure arithmetic over operator-supplied inputs", () => {
    const profile = getIndustryProfile({ category: "electrician" }, en); // deal 800, conv 0.35
    const roi = estimateRoi(profile, { leadsPerMonth: 10, monthlyPackagePrice: 299 }, en);
    // 10 leads * 0.7 capture * 800 deal * 0.35 conv = 1960
    expect(roi.revenueRecovered).toBe(1960);
    expect(roi.netMonthlyGain).toBe(1960 - 299);
    expect(roi.roiPercent).toBe(Math.round(((1960 - 299) / 299) * 100));
    // break-even leads = 299 / (800*0.35) = ~1.1
    expect(roi.breakEvenLeads).toBeCloseTo(1.1, 1);
  });
  test("is deterministic and echoes its assumptions honestly", () => {
    const profile = getIndustryProfile({ category: "plumber" }, en);
    const a = estimateRoi(profile, { leadsPerMonth: 8, monthlyPackagePrice: 299 }, en);
    const b = estimateRoi(profile, { leadsPerMonth: 8, monthlyPackagePrice: 299 }, en);
    expect(a).toEqual(b);
    expect(a.assumptionsNote).toMatch(/industry average/i);
    expect(a.assumptionsNote).toContain("8 leads/month");
  });
  test("respects deal-size and conversion overrides", () => {
    const profile = getIndustryProfile({ category: "electrician" }, en);
    const roi = estimateRoi(
      profile,
      { leadsPerMonth: 10, monthlyPackagePrice: 300, dealSize: 1000, conversionRate: 0.5 },
      en,
    );
    // 10 * 0.7 * 1000 * 0.5 = 3500
    expect(roi.revenueRecovered).toBe(3500);
    expect(roi.dealSize).toBe(1000);
  });
  test("localizes the assumptions note to Hebrew", () => {
    const profile = getIndustryProfile({ category: "מסעדה" }, he);
    const roi = estimateRoi(profile, { leadsPerMonth: 20, monthlyPackagePrice: 299 }, he);
    expect(roi.assumptionsNote).toContain("ממוצע");
    expect(roi.assumptionsNote).toContain("20");
  });
});
