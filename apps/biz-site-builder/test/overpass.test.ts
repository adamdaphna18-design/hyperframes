import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildOverpassQuery,
  elementsToBusinesses,
  OverpassSource,
  overpassElementToBusiness,
  parseOverpassSpec,
  type OverpassElement,
} from "../src/sources/overpass.ts";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "overpass.sample.json");

describe("overpassElementToBusiness", () => {
  test("maps a node with address and category", () => {
    const el: OverpassElement = {
      type: "node",
      id: 1,
      lat: 40.7,
      lon: -73.9,
      tags: {
        name: "Greenpoint Hardware",
        shop: "hardware",
        "addr:housenumber": "123",
        "addr:street": "Manhattan Ave",
        "addr:city": "Brooklyn",
        phone: "+1 718-555-0200",
      },
    };
    const b = overpassElementToBusiness(el)!;
    expect(b.name).toBe("Greenpoint Hardware");
    expect(b.category).toBe("Hardware");
    expect(b.address).toBe("123 Manhattan Ave, Brooklyn");
    expect(b.website).toBeNull();
    expect(b.location).toEqual({ lat: 40.7, lon: -73.9 });
  });

  test("uses center for ways and reads contact:website", () => {
    const el: OverpassElement = {
      type: "way",
      id: 2,
      center: { lat: 1, lon: 2 },
      tags: { name: "Book Shop", shop: "books", "contact:website": "https://books.example" },
    };
    const b = overpassElementToBusiness(el)!;
    expect(b.location).toEqual({ lat: 1, lon: 2 });
    expect(b.website).toBe("https://books.example");
  });

  test("skips unnamed elements", () => {
    expect(
      overpassElementToBusiness({ type: "node", id: 3, tags: { amenity: "bench" } }),
    ).toBeNull();
  });
});

describe("buildOverpassQuery", () => {
  test("area query references a named area", () => {
    const q = buildOverpassQuery({ area: "Brooklyn" });
    expect(q).toContain('area[name="Brooklyn"]');
    expect(q).toContain("out center tags;");
  });
  test("bbox query embeds the box", () => {
    const q = buildOverpassQuery({ bbox: "40.6,-74.0,40.7,-73.9" });
    expect(q).toContain("(40.6,-74.0,40.7,-73.9)");
  });
});

describe("parseOverpassSpec", () => {
  test("parses area and limit", () => {
    expect(parseOverpassSpec("area=Brooklyn,limit=200")).toEqual({ area: "Brooklyn", limit: 200 });
  });
  test("parses bbox", () => {
    expect(parseOverpassSpec("bbox=40.6,-74.0,40.7,-73.9")).toEqual({
      bbox: "40.6,-74.0,40.7,-73.9",
    });
  });
  test("bare value is an area name", () => {
    expect(parseOverpassSpec("Greenpoint")).toEqual({ area: "Greenpoint" });
  });
});

describe("OverpassSource.load", () => {
  test("loads and maps fixture via injected fetch", async () => {
    const body = await readFile(FIXTURE, "utf8");
    const fetchImpl = (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
    const src = new OverpassSource({ area: "Brooklyn", fetchImpl });
    const businesses = await src.load();
    // 4 elements, one is an unnamed bench → 3 businesses.
    expect(businesses).toHaveLength(3);
    expect(businesses.map((b) => b.name)).toContain("Greenpoint Hardware");
  });

  test("respects limit", async () => {
    const body = await readFile(FIXTURE, "utf8");
    const fetchImpl = (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
    const src = new OverpassSource({ area: "Brooklyn", limit: 2, fetchImpl });
    expect(await src.load()).toHaveLength(2);
  });

  test("throws without area or bbox", () => {
    expect(() => new OverpassSource({})).toThrow();
  });
});

describe("elementsToBusinesses", () => {
  test("filters nulls", () => {
    const out = elementsToBusinesses([
      { type: "node", id: 1, tags: { name: "A", shop: "x" } },
      { type: "node", id: 2, tags: {} },
    ]);
    expect(out).toHaveLength(1);
  });
});
