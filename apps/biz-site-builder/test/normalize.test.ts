import { describe, expect, test } from "bun:test";
import { normalizeRecord, parseReviews, slugify, splitList } from "../src/sources/normalize.ts";

describe("slugify", () => {
  test("normalises names", () => {
    expect(slugify("Rosa's Trattoria!")).toBe("rosa-s-trattoria");
    expect(slugify("Café Déjà Vu")).toBe("cafe-deja-vu");
  });
  test("never empty", () => {
    expect(slugify("!!!")).toBe("business");
  });
});

describe("splitList", () => {
  test("splits on pipe/semicolon/newline but not commas", () => {
    expect(splitList("a|b;c\nd")).toEqual(["a", "b", "c", "d"]);
    expect(splitList("123 Main St, Brooklyn, NY")).toEqual(["123 Main St, Brooklyn, NY"]);
  });
  test("passes through arrays", () => {
    expect(splitList(["x", "y"])).toEqual(["x", "y"]);
  });
});

describe("parseReviews", () => {
  test("parses 'Author (rating): text' strings", () => {
    const r = parseReviews("Maria (5): Best pasta | Dan: nice");
    expect(r[0]).toEqual({ author: "Maria", rating: 5, text: "Best pasta" });
    expect(r[1]).toEqual({ author: "Dan", text: "nice" });
  });
  test("parses structured review objects", () => {
    const r = parseReviews([{ author: "Nina", rating: 4, text: "clean burn" }]);
    expect(r[0]).toEqual({ author: "Nina", rating: 4, text: "clean burn" });
  });
});

describe("normalizeRecord", () => {
  test("maps aliases case-insensitively", () => {
    const b = normalizeRecord(
      { Business: "Rosa's", URL: "", Tel: "555", Photos: "a.jpg|b.jpg", Stars: "4.5" },
      "csv:test",
      0,
    );
    expect(b.name).toBe("Rosa's");
    expect(b.website).toBeNull();
    expect(b.phone).toBe("555");
    expect(b.images).toEqual(["a.jpg", "b.jpg"]);
    expect(b.rating).toBe(4.5);
  });

  test("falls back to a synthetic name and id", () => {
    const b = normalizeRecord({ note: "x" }, "csv:test", 2);
    expect(b.name).toBe("Business 3");
    expect(b.id).toContain("csv:test");
  });
});
