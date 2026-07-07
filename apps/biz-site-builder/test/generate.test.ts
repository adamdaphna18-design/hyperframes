import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { generateSite } from "../src/generate/site.ts";
import { generateVideo } from "../src/generate/video.ts";
import { generateIndexHtml, generateIndexJson } from "../src/generate/listing.ts";

const sample: Business = {
  id: "rosa",
  name: "Rosa's <Trattoria>",
  category: "Italian Restaurant",
  description: "Family-run trattoria serving hand-made pasta.",
  address: "512 Vine St, Brooklyn, NY",
  phone: "+1 718-555-0142",
  website: null,
  images: ["https://images.example/rosa-1.jpg"],
  reviews: [{ author: "Maria", rating: 5, text: "Best pasta <ever>" }],
  rating: 4.7,
};

describe("generateSite", () => {
  const html = generateSite(sample);
  test("includes the business name and category", () => {
    expect(html).toContain("Rosa&#39;s &lt;Trattoria&gt;");
    expect(html).toContain("Italian Restaurant");
  });
  test("escapes untrusted content (no raw angle brackets from data)", () => {
    expect(html).not.toContain("Rosa's <Trattoria>");
    expect(html).toContain("Best pasta &lt;ever&gt;");
  });
  test("renders review and image", () => {
    expect(html).toContain("What people say");
    expect(html).toContain("https://images.example/rosa-1.jpg");
  });
  test("is a complete HTML document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });
});

describe("generateVideo", () => {
  const html = generateVideo(sample);
  test("carries hyperframes composition attributes", () => {
    expect(html).toContain('data-composition-id="promo-rosa-s-trattoria"');
    expect(html).toContain('data-duration="9"');
    expect(html).toContain('class="clip"');
  });
  test("registers a paused timeline on window.__timelines", () => {
    expect(html).toContain("gsap.timeline({ paused: true })");
    expect(html).toContain("window.__timelines['promo-rosa-s-trattoria']");
  });
  test("is deterministic", () => {
    expect(generateVideo(sample)).toBe(html);
  });
  test("escapes data inside the composition", () => {
    expect(html).not.toContain("Rosa's <Trattoria>");
  });
});

describe("listing", () => {
  const entries = [
    {
      business: sample,
      status: { hasWebsite: false, reason: "no website listed" },
      sitePath: "sites/rosa.html",
      videoPath: "videos/rosa.html",
    },
    {
      business: { ...sample, id: "b2", name: "Has Site Co", website: "https://x.example" },
      status: { hasWebsite: true, url: "https://x.example/", reason: "has an owned website" },
    },
  ];
  test("index.json is valid and flags needs", () => {
    const json = JSON.parse(generateIndexJson(entries));
    expect(json[0].needsWebsite).toBe(true);
    expect(json[0].generatedSite).toBe("sites/rosa.html");
    expect(json[1].needsWebsite).toBe(false);
  });
  test("index.html lists both sections", () => {
    const html = generateIndexHtml(entries);
    expect(html).toContain("Websites built for these businesses");
    expect(html).toContain("Already have a website");
    expect(html).toContain("Has Site Co");
  });
});
