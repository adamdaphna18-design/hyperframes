import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { enrichPhotos, findRealPhotos } from "../src/sources/photos.ts";
import { foursquareProvider } from "../src/sources/photo-provider.ts";

function biz(p: Partial<Business>): Business {
  return { id: "b", name: "Rosa's", images: [], reviews: [], ...p };
}

const SITE_HTML = `<!doctype html><html><head>
  <meta property="og:image" content="https://rosa.example/hero.jpg">
  </head><body>
  <img src="/photos/shop.jpg"><img src="https://rosa.example/team.jpg">
  <img src="/icons/sprite.svg">
  </body></html>`;

describe("photo enrichment — real photos only", () => {
  test("keeps existing photos untouched (operator-supplied wins)", async () => {
    const b = biz({ images: ["https://x/own.jpg"] });
    expect(await findRealPhotos(b)).toEqual(["https://x/own.jpg"]);
    expect(await enrichPhotos(b)).toBe(0);
  });

  test("harvests the business's OWN existing site (no API key needed)", async () => {
    const fetchImpl = (async () =>
      new Response(SITE_HTML, {
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
    const b = biz({ website: "https://rosa.example" });
    const added = await enrichPhotos(b, { fetchImpl });
    expect(added).toBeGreaterThan(0);
    expect(b.images).toContain("https://rosa.example/hero.jpg");
    expect(b.images).toContain("https://rosa.example/photos/shop.jpg");
    // Junk assets (sprites/icons/svg) are not treated as real photos.
    expect(b.images.some((u) => u.includes("sprite"))).toBe(false);
  });

  test("falls back to Google Places for a business with no website", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchImpl = (async (input: string) => {
      if (input.includes("searchText")) {
        return new Response(
          JSON.stringify({ places: [{ id: "p", photos: [{ name: "places/p/photos/a" }] }] }),
        );
      }
      return new Response(bytes, { headers: { "content-type": "image/jpeg" } });
    }) as unknown as typeof fetch;
    const b = biz({ address: "Dizengoff 1, Tel Aviv" });
    const added = await enrichPhotos(b, { fetchImpl, placesApiKey: "K" });
    expect(added).toBe(1);
    expect(b.images[0]!.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  test("works with any provider (Foursquare) — vendor-neutral, not locked to Google", async () => {
    const fetchImpl = (async (input: string) => {
      if (input.includes("/search"))
        return new Response(JSON.stringify({ results: [{ fsq_id: "p" }] }));
      return new Response(
        JSON.stringify([{ prefix: "https://fastly.4sqi.net/img/", suffix: "/a.jpg" }]),
      );
    }) as unknown as typeof fetch;
    const b = biz({ address: "Rothschild 40, Tel Aviv" });
    const added = await enrichPhotos(b, { fetchImpl, provider: foursquareProvider("K") });
    expect(added).toBe(1);
    expect(b.images[0]).toBe("https://fastly.4sqi.net/img/original/a.jpg");
  });

  test("no sources → stays photoless, never fabricates", async () => {
    const b = biz({});
    expect(await enrichPhotos(b)).toBe(0);
    expect(b.images).toEqual([]);
  });
});
