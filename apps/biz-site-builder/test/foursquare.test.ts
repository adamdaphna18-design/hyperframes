import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import {
  fetchFoursquarePhotos,
  fsqPhotosUrl,
  fsqSearchUrl,
  parseFsqId,
  parseFsqPhotos,
} from "../src/sources/foursquare.ts";
import {
  foursquareProvider,
  googlePlacesProvider,
  resolvePhotoProvider,
} from "../src/sources/photo-provider.ts";

function biz(p: Partial<Business>): Business {
  return { id: "b", name: "Rosa's Cafe", images: [], reviews: [], ...p };
}

const PHOTOS_JSON = [
  {
    id: "1",
    prefix: "https://fastly.4sqi.net/img/general/",
    suffix: "/12345_abc.jpg",
    width: 1920,
    height: 1440,
  },
  {
    id: "2",
    prefix: "https://fastly.4sqi.net/img/general/",
    suffix: "/67890_def.jpg",
    width: 1080,
    height: 1080,
  },
];

describe("foursquare (pure)", () => {
  test("search URL carries query + near, not the key", () => {
    const u = fsqSearchUrl(biz({ address: "Dizengoff 1, Tel Aviv" }));
    expect(u).toContain("query=Rosa");
    expect(u).toContain("near=Dizengoff");
    expect(u).not.toContain("Bearer");
  });

  test("parseFsqId reads the first result", () => {
    expect(parseFsqId({ results: [{ fsq_id: "abc123" }] })).toBe("abc123");
    expect(parseFsqId({ results: [] })).toBeUndefined();
    expect(parseFsqId({})).toBeUndefined();
  });

  test("photos URL targets the place's photos endpoint", () => {
    expect(fsqPhotosUrl("abc123", { maxPhotos: 4 })).toBe(
      "https://api.foursquare.com/v3/places/abc123/photos?limit=4&sort=POPULAR",
    );
  });

  test("parseFsqPhotos assembles prefix+size+suffix public URLs (no key in them)", () => {
    const urls = parseFsqPhotos(PHOTOS_JSON, { size: "original" });
    expect(urls).toEqual([
      "https://fastly.4sqi.net/img/general/original/12345_abc.jpg",
      "https://fastly.4sqi.net/img/general/original/67890_def.jpg",
    ]);
    expect(parseFsqPhotos([])).toEqual([]);
  });
});

describe("fetchFoursquarePhotos (network injected)", () => {
  test("resolves a place then returns its public photo URLs", async () => {
    const fetchImpl = (async (input: string) => {
      if (input.includes("/search"))
        return new Response(JSON.stringify({ results: [{ fsq_id: "p1" }] }));
      return new Response(JSON.stringify(PHOTOS_JSON));
    }) as unknown as typeof fetch;
    const photos = await fetchFoursquarePhotos(biz({ address: "Tel Aviv" }), {
      apiKey: "SECRET",
      fetchImpl,
    });
    expect(photos).toHaveLength(2);
    expect(photos.every((u) => u.startsWith("https://fastly.4sqi.net/"))).toBe(true);
    expect(photos.join()).not.toContain("SECRET");
  });

  test("no key → empty, no fabrication", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response("[]");
    }) as unknown as typeof fetch;
    expect(await fetchFoursquarePhotos(biz({}), { apiKey: "", fetchImpl })).toEqual([]);
    expect(calls).toBe(0);
  });
});

describe("resolvePhotoProvider (vendor-neutral)", () => {
  test("picks the named provider when its key is present", () => {
    expect(resolvePhotoProvider("foursquare", { foursquare: "k" })!.name).toBe("foursquare");
    expect(resolvePhotoProvider("google", { googlePlaces: "k" })!.name).toBe("google-places");
  });

  test("with no name, prefers Foursquare (cheaper) when both keys exist", () => {
    const p = resolvePhotoProvider(undefined, { googlePlaces: "g", foursquare: "f" });
    expect(p!.name).toBe("foursquare");
  });

  test("returns undefined when the chosen provider has no key (falls back to website-only)", () => {
    expect(resolvePhotoProvider("foursquare", { googlePlaces: "g" })).toBeUndefined();
    expect(resolvePhotoProvider(undefined, {})).toBeUndefined();
  });

  test("providers expose a uniform photosFor()", () => {
    expect(typeof googlePlacesProvider("k").photosFor).toBe("function");
    expect(typeof foursquareProvider("k").photosFor).toBe("function");
  });
});
