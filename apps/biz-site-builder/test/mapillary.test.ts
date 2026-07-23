import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import {
  bboxAround,
  fetchMapillaryPhotos,
  mapillaryImagesUrl,
  parseMapillaryThumbs,
} from "../src/sources/mapillary.ts";
import { mapillaryProvider, resolvePhotoProvider } from "../src/sources/photo-provider.ts";

function biz(p: Partial<Business>): Business {
  return { id: "b", name: "Cafe Rothschild", images: [], reviews: [], ...p };
}

const IMAGES_JSON = {
  data: [
    { id: "1", thumb_1024_url: "https://scontent.mapillary.com/a.jpg", computed_geometry: {} },
    { id: "2", thumb_1024_url: "https://scontent.mapillary.com/b.jpg", computed_geometry: {} },
  ],
};

describe("mapillary (pure)", () => {
  test("bboxAround makes a tight box centred on the point", () => {
    const bbox = bboxAround({ lat: 32.07, lon: 34.77 }, 30).split(",").map(Number);
    const [minLon, minLat, maxLon, maxLat] = bbox as [number, number, number, number];
    expect(minLon).toBeLessThan(34.77);
    expect(maxLon).toBeGreaterThan(34.77);
    expect(minLat).toBeLessThan(32.07);
    expect(maxLat).toBeGreaterThan(32.07);
    // ~30m box is well under a hundredth of a degree.
    expect(maxLat - minLat).toBeLessThan(0.001);
  });

  test("images URL carries the token as a server-side param + fields/bbox", () => {
    const u = mapillaryImagesUrl("1,2,3,4", { accessToken: "MLY|tok", limit: 4 });
    expect(u).toContain("access_token=MLY");
    expect(u).toContain("thumb_1024_url");
    expect(u).toContain("bbox=1%2C2%2C3%2C4");
    expect(u).toContain("limit=4");
  });

  test("parseMapillaryThumbs pulls token-free public thumb URLs", () => {
    expect(parseMapillaryThumbs(IMAGES_JSON)).toEqual([
      "https://scontent.mapillary.com/a.jpg",
      "https://scontent.mapillary.com/b.jpg",
    ]);
    expect(parseMapillaryThumbs({ data: [] })).toEqual([]);
    expect(parseMapillaryThumbs({})).toEqual([]);
  });
});

describe("fetchMapillaryPhotos (network injected)", () => {
  test("returns street-level thumbs for a located business (no token in output)", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify(IMAGES_JSON))) as unknown as typeof fetch;
    const photos = await fetchMapillaryPhotos(biz({ location: { lat: 32.07, lon: 34.77 } }), {
      accessToken: "MLY|SECRET",
      fetchImpl,
    });
    expect(photos).toHaveLength(2);
    expect(photos.join()).not.toContain("SECRET");
  });

  test("no coordinates → nothing (location-based source)", async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called++;
      return new Response("{}");
    }) as unknown as typeof fetch;
    expect(await fetchMapillaryPhotos(biz({}), { accessToken: "t", fetchImpl })).toEqual([]);
    expect(called).toBe(0);
  });
});

describe("resolvePhotoProvider — Mapillary is opt-in only", () => {
  test("named mapillary with a token resolves", () => {
    expect(resolvePhotoProvider("mapillary", { mapillary: "t" })!.name).toBe("mapillary");
  });

  test("is never auto-preferred: no name + only a mapillary token → undefined", () => {
    // Approximate/street-level, so it must be chosen explicitly, not by default.
    expect(resolvePhotoProvider(undefined, { mapillary: "t" })).toBeUndefined();
  });

  test("provider exposes photosFor()", () => {
    expect(typeof mapillaryProvider("t").photosFor).toBe("function");
  });
});
