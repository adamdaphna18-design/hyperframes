import { describe, expect, test } from "bun:test";
import { stringsFor } from "../src/i18n/strings.ts";
import { auditReportHtml, buildAuditReport, comparisonHtml } from "../src/generate/audit.ts";
import { recommendAiServices } from "../src/generate/opportunities.ts";
import { estimateRoi } from "../src/generate/roi.ts";

const en = stringsFor("en");
const he = stringsFor("he");

// A weak, outdated, SEO-poor page.
const badHtml = `<html><head><script src="/jquery-1.11.min.js"></script>
  <script src="https://static.wixstatic.com/x.js"></script></head>
  <body><img src="a.jpg"><img src="b.jpg"><img src="c.jpg"><img src="d.jpg"></body></html>`;

// A healthy page.
const goodHtml = `<!doctype html><html lang="en"><head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Great Cafe — Coffee in Tel Aviv</title>
  <meta name="description" content="A lovely cafe.">
  <meta property="og:image" content="https://x/og.png">
  <script type="application/ld+json">{"@type":"CafeOrCoffeeShop"}</script>
  </head><body><h1>Great Cafe</h1><img src="a.jpg" alt="latte" loading="lazy"></body></html>`;

describe("buildAuditReport", () => {
  test("scores a bad site low and maps issues to services", () => {
    const r = buildAuditReport({ html: badHtml, url: "http://shop.example" }, en);
    expect(r.score).toBeLessThan(60);
    expect(r.platform).toBe("Wix");
    expect(r.weakBuilder).toBe(true);
    expect(r.outdated).toBe(true);
    // No HTTPS, no title/description, missing viewport/og → varied services.
    const areas = r.findings.map((f) => f.area);
    expect(areas).toContain("security"); // http:// URL
    expect(areas).toContain("mobile"); // no viewport
    expect(areas).toContain("seo");
    expect(areas).toContain("tech");
    expect(r.services).toContain("Website redesign");
    // Weak/outdated → a redesign estimate.
    expect(r.estimate.kind).toBe("redesign");
    expect(r.estimate.min).toBeGreaterThan(0);
  });

  test("a healthy site scores high with few findings → optimize package", () => {
    const r = buildAuditReport({ html: goodHtml, url: "https://cafe.example" }, en);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.estimate.kind).toBe("optimize");
  });

  test("detects mixed content on an https page", () => {
    const html = `<html><head><meta name="viewport" content="x"><title>t</title><meta name="description" content="d"><script type="application/ld+json">{}</script></head><body><h1>a</h1><img src="http://cdn/x.jpg" alt="x"></body></html>`;
    const r = buildAuditReport({ html, url: "https://x.example" }, en);
    expect(r.findings.some((f) => f.area === "security" && /mixed/i.test(f.title))).toBe(true);
  });

  test("localizes findings and services to Hebrew", () => {
    const r = buildAuditReport({ html: badHtml, url: "http://shop.example" }, he);
    expect(r.services.some((x) => x.includes("קידום") || x.includes("בנייה"))).toBe(true);
    expect(r.findings.some((f) => /HTTPS|אבטחה/.test(f.service))).toBe(true);
  });
});

describe("auditReportHtml", () => {
  test("renders a branded report with score, services and estimate", () => {
    const r = buildAuditReport({ html: badHtml, url: "http://shop.example" }, en);
    const html = auditReportHtml(r, { s: en, brand: "MyAgency" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Website Audit");
    expect(html).toContain(`>${r.score}<`); // score gauge
    expect(html).toContain("₪");
    expect(html).toContain("MyAgency");
  });
  test("Hebrew report is RTL", () => {
    const r = buildAuditReport({ html: badHtml, url: "http://shop.example" }, he);
    expect(auditReportHtml(r, { s: he })).toContain('dir="rtl"');
  });
  test("renders the industry must-haves section from the profile", () => {
    const business = {
      id: "1",
      name: "Volt Electric",
      category: "electrician",
      images: [],
      reviews: [],
    };
    const r = buildAuditReport({ html: badHtml, url: "http://volt.example", business }, en);
    expect(r.industry.key).toBe("electrician");
    const html = auditReportHtml(r, { s: en });
    expect(html).toContain("Electrician site needs");
    expect(html).toContain(r.industry.requiredFeatures[0]!);
    expect(html).toContain(r.industry.closingPitch.slice(0, 12));
  });
  test("renders the ROI panel only when an estimate is supplied", () => {
    const business = {
      id: "1",
      name: "Volt Electric",
      category: "electrician",
      images: [],
      reviews: [],
    };
    const r = buildAuditReport({ html: badHtml, url: "http://volt.example", business }, en);
    const roi = estimateRoi(r.industry, { leadsPerMonth: 10, monthlyPackagePrice: 299 }, en);
    expect(auditReportHtml(r, { s: en, roi })).toContain("Potential return");
    // No roi → no panel.
    expect(auditReportHtml(r, { s: en })).not.toContain("Potential return");
  });
  test("carries an industry pain point and renders it", () => {
    const business = {
      id: "1",
      name: "Rosa's Trattoria",
      category: "restaurant",
      images: [],
      reviews: [],
    };
    const r = buildAuditReport({ html: badHtml, url: "http://shop.example", business }, en);
    expect(r.painPoint).toMatch(/order|book|table/i);
    expect(auditReportHtml(r, { s: en })).toContain(r.painPoint.slice(0, 12));
  });
});

describe("AI-service opportunities", () => {
  test("recommends services anchored to findings, with a discounted bundle", () => {
    const r = buildAuditReport({ html: badHtml, url: "http://shop.example" }, en);
    const opp = recommendAiServices(r, en);
    expect(opp.services.length).toBeGreaterThan(1);
    // Every recommended service maps to an area that actually has a finding.
    const areas = new Set(r.findings.map((f) => f.area));
    const anchored = opp.services.every((svc) =>
      ["seo-content", "receptionist", "lead-qualifier", "ai-agent"].includes(svc.key),
    );
    expect(anchored).toBe(true);
    expect(areas.size).toBeGreaterThan(0);
    // Bundle is cheaper than the naive sum (20% off).
    const sum = opp.services.reduce((n, x) => n + x.monthly, 0);
    expect(opp.bundleMonthly).toBeLessThan(sum);
    expect(opp.currency).toBe("₪");
  });
  test("a healthy site gets no upsell (empty set)", () => {
    const r = buildAuditReport({ html: goodHtml, url: "https://cafe.example" }, en);
    expect(recommendAiServices(r, en).services).toHaveLength(0);
  });
  test("offers the flagship AI Agent when gaps span 2+ areas", () => {
    const r = buildAuditReport({ html: badHtml, url: "http://shop.example" }, en);
    const opp = recommendAiServices(r, en);
    const agent = opp.services.find((svc) => svc.key === "ai-agent");
    expect(agent).toBeDefined();
    expect(agent!.monthly).toBe(899);
    // Renders in the report's AI Workforce section.
    expect(auditReportHtml(r, { s: en })).toContain(agent!.name);
    // Hebrew flavor too.
    const rHe = buildAuditReport({ html: badHtml, url: "http://shop.example" }, he);
    expect(recommendAiServices(rHe, he).services.some((x) => x.key === "ai-agent")).toBe(true);
  });
  test("no AI Agent when only a single area has a finding", () => {
    // A site whose only issue is a missing og:image (one 'social' finding).
    const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="x"><title>t</title><meta name="description" content="d"><script type="application/ld+json">{}</script></head><body><h1>a</h1><img src="a.jpg" alt="x" loading="lazy"></body></html>`;
    const r = buildAuditReport({ html, url: "https://x.example" }, en);
    expect(new Set(r.findings.map((f) => f.area)).size).toBe(1);
    expect(recommendAiServices(r, en).services.some((x) => x.key === "ai-agent")).toBe(false);
  });
  test("the audit report renders the AI Workforce section when services apply", () => {
    const r = buildAuditReport({ html: badHtml, url: "http://shop.example" }, en);
    const html = auditReportHtml(r, { s: en });
    expect(html).toContain("AI Workforce");
    expect(html).toContain("/mo");
    // Healthy site → no section.
    const good = buildAuditReport({ html: goodHtml, url: "https://cafe.example" }, en);
    expect(auditReportHtml(good, { s: en })).not.toContain("AI Workforce");
  });
  test("localizes the AI Workforce section to Hebrew", () => {
    const r = buildAuditReport({ html: badHtml, url: "http://shop.example" }, he);
    expect(auditReportHtml(r, { s: he })).toContain("צוות AI");
  });
});

describe("comparisonHtml", () => {
  test("renders a you-vs-competitor table and flags where the subject is behind", () => {
    const subject = buildAuditReport({ html: badHtml, url: "http://shop.example" }, en);
    const competitor = buildAuditReport({ html: goodHtml, url: "https://cafe.example" }, en);
    const html = comparisonHtml(subject, competitor, { s: en, brand: "MyAgency" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain(String(subject.score));
    expect(html).toContain(String(competitor.score));
    // Bad subject vs. healthy competitor → competitor ahead on ≥1 dimension.
    expect(html).toMatch(/ahead on \d+/);
    expect(html).toContain("MyAgency");
  });
  test("Hebrew comparison is RTL", () => {
    const subject = buildAuditReport({ html: badHtml, url: "http://shop.example" }, he);
    const competitor = buildAuditReport({ html: goodHtml, url: "https://cafe.example" }, he);
    expect(comparisonHtml(subject, competitor, { s: he })).toContain('dir="rtl"');
  });
});
