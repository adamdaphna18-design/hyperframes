import { describe, expect, test } from "bun:test";
import {
  absolutize,
  extractImages,
  extractJsonLd,
  parseWebSpec,
  scrapeBusiness,
  USER_AGENTS,
  WebSource,
} from "../src/sources/web.ts";

describe("absolutize", () => {
  test("resolves relative URLs against a base", () => {
    expect(absolutize("/img/a.jpg", "https://cafe.example/menu")).toBe(
      "https://cafe.example/img/a.jpg",
    );
    expect(absolutize("https://cdn.example/x.jpg", "https://cafe.example")).toBe(
      "https://cdn.example/x.jpg",
    );
  });
});

describe("extractJsonLd", () => {
  test("finds a LocalBusiness node", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "Restaurant",
      name: "Cafe Nine",
    })}</script>`;
    expect(extractJsonLd(html)?.name).toBe("Cafe Nine");
  });
  test("digs into @graph", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@graph": [{ "@type": "WebSite" }, { "@type": "LocalBusiness", name: "Nine" }],
    })}</script>`;
    expect(extractJsonLd(html)?.name).toBe("Nine");
  });
});

describe("extractImages", () => {
  test("collects og:image and img tags as absolute URLs, skipping icons", () => {
    const html = `
      <meta property="og:image" content="/hero.jpg">
      <img src="photo1.jpg"><img src="/assets/icon.svg"><img src="https://cdn.example/p2.jpg">`;
    const imgs = extractImages(html, "https://shop.example/");
    expect(imgs).toContain("https://shop.example/hero.jpg");
    expect(imgs).toContain("https://shop.example/photo1.jpg");
    expect(imgs).toContain("https://cdn.example/p2.jpg");
    expect(imgs.some((u) => u.endsWith(".svg"))).toBe(false);
  });
});

describe("scrapeBusiness", () => {
  test("builds a business from JSON-LD + meta", () => {
    const html = `<html><head>
      <title>Cafe Nine | Best coffee</title>
      <meta property="og:description" content="Neighbourhood roastery">
      <script type="application/ld+json">${JSON.stringify({
        "@type": "CafeOrCoffeeShop",
        name: "Cafe Nine",
        telephone: "+1 212-555-0000",
        address: { streetAddress: "9 Bean St", addressLocality: "Brooklyn" },
        aggregateRating: { ratingValue: "4.8" },
        review: [
          {
            reviewBody: "Great espresso",
            author: { name: "Sam" },
            reviewRating: { ratingValue: 5 },
          },
        ],
      })}</script>
      </head><body><img src="/latte.jpg"></body></html>`;
    const b = scrapeBusiness({
      url: "https://nine.example",
      finalUrl: "https://nine.example",
      status: 200,
      html,
    });
    expect(b.name).toBe("Cafe Nine");
    expect(b.phone).toBe("+1 212-555-0000");
    expect(b.address).toBe("9 Bean St, Brooklyn");
    expect(b.rating).toBe(4.8);
    expect(b.reviews[0]).toEqual({ text: "Great espresso", author: "Sam", rating: 5 });
    expect(b.images).toContain("https://nine.example/latte.jpg");
  });

  test("falls back to <title> when no structured data", () => {
    const b = scrapeBusiness({
      url: "https://x.example",
      finalUrl: "https://x.example",
      status: 200,
      html: "<title>Joe's Garage – Auto Repair</title>",
    });
    expect(b.name).toBe("Joe's Garage");
  });
});

describe("WebSource", () => {
  test("fetches with a crawler UA and scrapes (injected fetch)", async () => {
    let seenUa = "";
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seenUa = (init.headers as Record<string, string>)["User-Agent"] ?? "";
      return new Response(`<title>Bagel Bros</title>`, { status: 200 });
    }) as unknown as typeof fetch;
    const src = new WebSource({
      urls: ["https://bagels.example"],
      fetchImpl,
      userAgent: "googlebot",
    });
    const out = await src.load();
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("Bagel Bros");
    expect(seenUa).toBe(USER_AGENTS.googlebot!);
  });

  test("drops non-2xx responses", async () => {
    const fetchImpl = (async () =>
      new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const src = new WebSource({ urls: ["https://x.example"], fetchImpl });
    expect(await src.load()).toHaveLength(0);
  });

  test("throws without URLs", () => {
    expect(() => new WebSource({ urls: [] })).toThrow();
  });
});

describe("parseWebSpec", () => {
  test("parses URLs and a user agent", () => {
    expect(parseWebSpec("https://a.com,https://b.com;ua=chrome")).toEqual({
      urls: ["https://a.com", "https://b.com"],
      userAgent: "chrome",
    });
  });
});
