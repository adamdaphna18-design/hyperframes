import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { detectWebsite, isOwnWebsite, normalizeUrl, verifyLive } from "../src/website/detect.ts";

function biz(website: string | null): Business {
  return { id: "x", name: "Test", website, images: [], reviews: [] };
}

describe("normalizeUrl", () => {
  test("adds scheme and validates host", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com/");
    expect(normalizeUrl("https://x.example/path")).toBe("https://x.example/path");
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("localhost")).toBeNull();
  });
});

describe("isOwnWebsite", () => {
  test("rejects social/marketplace hosts", () => {
    expect(isOwnWebsite("https://facebook.com/foo")).toBe(false);
    expect(isOwnWebsite("https://www.instagram.com/foo")).toBe(false);
    expect(isOwnWebsite("https://mybakery.example")).toBe(true);
  });
});

describe("detectWebsite", () => {
  test("no website", () => {
    expect(detectWebsite(biz(null)).hasWebsite).toBe(false);
    expect(detectWebsite(biz("")).hasWebsite).toBe(false);
  });
  test("owned website", () => {
    const s = detectWebsite(biz("mybakery.example"));
    expect(s.hasWebsite).toBe(true);
    expect(s.url).toBe("https://mybakery.example/");
  });
  test("social-only counts as needing a site", () => {
    const s = detectWebsite(biz("https://facebook.com/cornercuts"));
    expect(s.hasWebsite).toBe(false);
    expect(s.reason).toContain("social");
  });
  test("garbage url counts as needing a site", () => {
    expect(detectWebsite(biz("n/a")).hasWebsite).toBe(false);
  });
});

describe("verifyLive", () => {
  const status = detectWebsite(biz("mybakery.example"));

  test("live site stays hasWebsite=true", async () => {
    const fetchImpl = (async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    const s = await verifyLive(status, { fetchImpl });
    expect(s.hasWebsite).toBe(true);
    expect(s.live).toBe(true);
  });

  test("dead link flips to needs-website", async () => {
    const fetchImpl = (async () =>
      new Response("gone", { status: 404 })) as unknown as typeof fetch;
    const s = await verifyLive(status, { fetchImpl });
    expect(s.hasWebsite).toBe(false);
    expect(s.live).toBe(false);
  });

  test("network error is non-strict by default (unknown, keep site)", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const s = await verifyLive(status, { fetchImpl });
    expect(s.hasWebsite).toBe(true);
    expect(s.live).toBeUndefined();
  });

  test("strict mode treats error as dead", async () => {
    const fetchImpl = (async () => {
      throw new Error("timeout");
    }) as unknown as typeof fetch;
    const s = await verifyLive(status, { fetchImpl, strict: true });
    expect(s.hasWebsite).toBe(false);
  });
});
