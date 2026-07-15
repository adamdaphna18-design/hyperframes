import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import {
  commonsFilePath,
  fetchWikidataImage,
  osmFreePhotos,
  osmWikidataId,
  parseOsmPhotoTags,
} from "../src/sources/osm-photos.ts";
import { enrichPhotos } from "../src/sources/photos.ts";

function biz(p: Partial<Business>): Business {
  return { id: "b", name: "Cafe Rothschild", images: [], reviews: [], ...p };
}

describe("free OSM/Wikimedia photos (keyless, no paid API)", () => {
  test("commonsFilePath builds a keyless direct image URL", () => {
    const u = commonsFilePath("File:Cafe Rothschild interior.jpg", { width: 800 });
    expect(u).toBe(
      "https://commons.wikimedia.org/wiki/Special:FilePath/Cafe_Rothschild_interior.jpg?width=800",
    );
    expect(u).not.toContain("key="); // keyless by construction
  });

  test("parseOsmPhotoTags reads image, image:N and wikimedia_commons files", () => {
    const urls = parseOsmPhotoTags({
      image: "https://static.example/shop.jpg",
      "image:1": "https://static.example/inside.jpg",
      wikimedia_commons: "File:Storefront.jpg;Category:Ignore me",
    });
    expect(urls).toContain("https://static.example/shop.jpg");
    expect(urls).toContain("https://static.example/inside.jpg");
    expect(urls.some((u) => u.includes("Special:FilePath/Storefront.jpg"))).toBe(true);
    // A Category (not a File) is not a resolvable single image → skipped.
    expect(urls.some((u) => u.includes("Ignore"))).toBe(false);
  });

  test("osmWikidataId accepts only Q-ids", () => {
    expect(osmWikidataId({ wikidata: "Q42" })).toBe("Q42");
    expect(osmWikidataId({ wikidata: "not-a-qid" })).toBeUndefined();
    expect(osmWikidataId({})).toBeUndefined();
  });

  test("fetchWikidataImage resolves the P18 image (free API injected)", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          entities: {
            Q42: { claims: { P18: [{ mainsnak: { datavalue: { value: "Storefront.jpg" } } }] } },
          },
        }),
      )) as unknown as typeof fetch;
    const url = await fetchWikidataImage("Q42", { fetchImpl });
    expect(url).toBe("https://commons.wikimedia.org/wiki/Special:FilePath/Storefront.jpg");
  });

  test("enrichPhotos uses the free source with NO key and NO paid provider", async () => {
    const b = biz({ tags: { wikimedia_commons: "File:Cafe.jpg" } });
    const added = await enrichPhotos(b); // no key, no provider, no network
    expect(added).toBe(1);
    expect(b.images[0]).toContain("Special:FilePath/Cafe.jpg");
  });

  test("no photo tags → stays photoless, never fabricates", async () => {
    const b = biz({ tags: { cuisine: "coffee" } });
    expect(await osmFreePhotos(b)).toEqual([]);
    expect(await enrichPhotos(b)).toBe(0);
    expect(b.images).toEqual([]);
  });
});
