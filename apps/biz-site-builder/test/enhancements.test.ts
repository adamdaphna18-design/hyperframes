import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { stringsFor } from "../src/i18n/strings.ts";
import { jsonLdScript, localBusinessJsonLd, schemaType } from "../src/generate/schema.ts";
import { hasMap, leafletAssets, leafletMap } from "../src/generate/map.ts";
import { generateRobots, generateSitemap } from "../src/generate/sitemap.ts";
import { geocodeAddress } from "../src/sources/geocode.ts";
import { generateWordPressBundle } from "../src/wordpress/bundle.ts";
import { generateSite } from "../src/generate/site.ts";

const en = stringsFor("en");

const rosa: Business = {
  id: "rosa",
  name: "Rosa's Trattoria",
  category: "Italian Restaurant",
  description: "Family-run trattoria.",
  address: "512 Vine St, Brooklyn, NY",
  phone: "+1 718-555-0142",
  website: null,
  images: ["https://img.example/a.jpg"],
  reviews: [
    { author: "Maria", rating: 5, text: "Best pasta" },
    { author: "Dan", rating: 4, text: "Lovely" },
  ],
  rating: 4.7,
  location: { lat: 40.7181, lon: -73.9571 },
};

describe("schema.org JSON-LD", () => {
  test("maps categories to schema.org subtypes", () => {
    expect(schemaType("Italian Restaurant")).toBe("Restaurant");
    expect(schemaType("Coffee Shop")).toBe("CafeOrCoffeeShop");
    expect(schemaType("Book Store")).toBe("Store");
    expect(schemaType(undefined)).toBe("LocalBusiness");
  });

  test("builds a LocalBusiness node with rating, reviews and geo", () => {
    const node = localBusinessJsonLd(rosa, en);
    expect(node["@type"]).toBe("Restaurant");
    expect(node.name).toBe("Rosa's Trattoria");
    expect((node.aggregateRating as Record<string, unknown>).reviewCount).toBe(2);
    expect((node.geo as Record<string, unknown>).latitude).toBe(40.7181);
    expect((node.review as unknown[]).length).toBe(2);
  });

  test("script tag escapes < to survive inline embedding", () => {
    const evil = { ...rosa, description: "we </script> pasta" };
    const script = jsonLdScript(evil, en);
    expect(script).toContain("application/ld+json");
    expect(script).not.toContain("</script> pasta");
    expect(script).toContain("\\u003c/script>");
  });
});

describe("Leaflet map", () => {
  test("assets reference leaflet + a map init uses OSM tiles", () => {
    expect(leafletAssets()).toContain("leaflet@1.9.4/dist/leaflet.js");
    const map = leafletMap({ lat: 40.7, lon: -73.9 }, "Rosa's");
    expect(map).toContain("tile.openstreetmap.org");
    expect(map).toContain("L.map");
    expect(map).toContain("40.7");
  });
  test("hasMap reflects presence of coordinates", () => {
    expect(hasMap(rosa)).toBe(true);
    expect(hasMap({ ...rosa, location: undefined })).toBe(false);
  });
});

describe("sitemap + robots", () => {
  const entries = [
    { business: rosa, status: { hasWebsite: false, reason: "x" }, sitePath: "sites/rosa.html" },
    { business: rosa, status: { hasWebsite: false, reason: "x" }, wpBundlePath: "sites/rosa/" },
  ];
  test("sitemap lists index + built sites under the base URL", () => {
    const xml = generateSitemap(entries, "https://dir.example/");
    expect(xml).toContain("<loc>https://dir.example/index.html</loc>");
    expect(xml).toContain("<loc>https://dir.example/sites/rosa.html</loc>");
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });
  test("robots points at the sitemap", () => {
    expect(generateRobots("https://dir.example")).toContain(
      "Sitemap: https://dir.example/sitemap.xml",
    );
  });
});

describe("Nominatim geocoding", () => {
  test("returns a point from a Nominatim response", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify([{ lat: "32.0853", lon: "34.7818" }]), {
        status: 200,
      })) as unknown as typeof fetch;
    expect(await geocodeAddress("Tel Aviv", { fetchImpl })).toEqual({ lat: 32.0853, lon: 34.7818 });
  });
  test("null on empty results, errors, or blank address", async () => {
    const empty = (async () => new Response("[]", { status: 200 })) as unknown as typeof fetch;
    expect(await geocodeAddress("nowhere", { fetchImpl: empty })).toBeNull();
    expect(await geocodeAddress("", { fetchImpl: empty })).toBeNull();
    const boom = (async () => {
      throw new Error("net");
    }) as unknown as typeof fetch;
    expect(await geocodeAddress("x", { fetchImpl: boom })).toBeNull();
  });
});

describe("integration into outputs", () => {
  test("static site embeds JSON-LD and a Leaflet map when located", () => {
    const html = generateSite(rosa, en);
    expect(html).toContain("application/ld+json");
    expect(html).toContain("tile.openstreetmap.org");
    expect(html).toContain("leaflet@1.9.4");
  });

  test("WordPress bundle ships schema mu-plugin + map functions.php for located business", async () => {
    const bundle = await generateWordPressBundle(rosa, { strings: en });
    const paths = bundle.files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith("mu-plugins/") && p.endsWith("-schema.php"))).toBe(true);
    expect(paths.some((p) => p.endsWith("functions.php"))).toBe(true);
    const funcs = bundle.files.find((f) => f.path.endsWith("functions.php"))!.content;
    expect(funcs).toContain("add_shortcode('bsb_map'");
    const wxr = bundle.files.find((f) => f.path === "content.wxr.xml")!.content;
    expect(wxr).toContain("[bsb_map");
  });

  test("no functions.php when the business has no coordinates", async () => {
    const bundle = await generateWordPressBundle({ ...rosa, location: undefined }, { strings: en });
    expect(bundle.files.some((f) => f.path.endsWith("functions.php"))).toBe(false);
  });
});
