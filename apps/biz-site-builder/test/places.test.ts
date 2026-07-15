import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import {
  fetchPlacePhotoData,
  parsePlacesPhotos,
  photoMediaUrl,
  placeQuery,
  placesSearchRequest,
} from "../src/sources/places.ts";

function biz(p: Partial<Business>): Business {
  return { id: "b", name: "מספרת רוטשילד", images: [], reviews: [], ...p };
}

// A realistic Places (New) searchText response.
const SEARCH_JSON = {
  places: [
    {
      id: "ChIJabc",
      displayName: { text: "מספרת רוטשילד" },
      photos: [
        { name: "places/ChIJabc/photos/Aeic1", widthPx: 4032, heightPx: 3024 },
        { name: "places/ChIJabc/photos/Aeic2", widthPx: 3000, heightPx: 2000 },
        { name: "not-a-photo" }, // ignored
      ],
    },
  ],
};

describe("places request/parse (pure)", () => {
  test("placeQuery combines name + address", () => {
    expect(placeQuery(biz({ address: "רוטשילד 40, תל אביב" }))).toBe(
      "מספרת רוטשילד, רוטשילד 40, תל אביב",
    );
  });

  test("search request carries the key in a header, not the URL, with a tight field mask", () => {
    const { url, init } = placesSearchRequest(biz({ address: "תל אביב" }), { apiKey: "SECRET" });
    expect(url).not.toContain("SECRET"); // key is a header, never the URL
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("SECRET");
    expect(headers["X-Goog-FieldMask"]).toContain("places.photos");
    expect(JSON.parse(String(init.body)).textQuery).toContain("תל אביב");
  });

  test("parsePlacesPhotos keeps only well-formed photo refs", () => {
    const refs = parsePlacesPhotos(SEARCH_JSON);
    expect(refs.map((r) => r.name)).toEqual([
      "places/ChIJabc/photos/Aeic1",
      "places/ChIJabc/photos/Aeic2",
    ]);
    expect(parsePlacesPhotos({})).toEqual([]);
    expect(parsePlacesPhotos({ places: [] })).toEqual([]);
  });

  test("photoMediaUrl includes width and key", () => {
    const u = photoMediaUrl({ name: "places/x/photos/y" }, { apiKey: "K", maxWidthPx: 800 });
    expect(u).toContain("places/x/photos/y/media");
    expect(u).toContain("maxWidthPx=800");
    expect(u).toContain("key=K");
  });
});

describe("fetchPlacePhotoData (network injected)", () => {
  test("returns the business's Google photos as key-safe data: URIs", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]); // JPEG-ish
    const fetchImpl = (async (input: string) => {
      if (input.includes("searchText")) {
        return new Response(JSON.stringify(SEARCH_JSON), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(bytes, { headers: { "content-type": "image/jpeg" } });
    }) as unknown as typeof fetch;

    const photos = await fetchPlacePhotoData(biz({ address: "תל אביב" }), {
      apiKey: "SECRET",
      fetchImpl,
      maxPhotos: 2,
    });
    expect(photos).toHaveLength(2);
    for (const p of photos) {
      expect(p.startsWith("data:image/jpeg;base64,")).toBe(true);
      expect(p).not.toContain("SECRET"); // key never reaches the output
    }
  });

  test("no key → no call, empty result (never fabricates)", async () => {
    let called = 0;
    const fetchImpl = (async () => {
      called++;
      return new Response("{}");
    }) as unknown as typeof fetch;
    expect(await fetchPlacePhotoData(biz({}), { apiKey: "", fetchImpl })).toEqual([]);
    expect(called).toBe(0);
  });

  test("a place with no photos yields nothing (no stock substitute)", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ places: [{ id: "x" }] }))) as unknown as typeof fetch;
    expect(await fetchPlacePhotoData(biz({}), { apiKey: "K", fetchImpl })).toEqual([]);
  });
});
