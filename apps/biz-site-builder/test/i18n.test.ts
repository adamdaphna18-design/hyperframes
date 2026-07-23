import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { hasHebrew, isIsraelMarket, resolveLocale } from "../src/i18n/locale.ts";
import { stringsFor } from "../src/i18n/strings.ts";

function biz(partial: Partial<Business>): Business {
  return { id: "x", name: "Test", website: null, images: [], reviews: [], ...partial };
}

describe("hasHebrew", () => {
  test("detects Hebrew characters", () => {
    expect(hasHebrew("מאפייה")).toBe(true);
    expect(hasHebrew("Bakery")).toBe(false);
  });
});

describe("isIsraelMarket", () => {
  test("true for +972 phone", () => {
    expect(isIsraelMarket(biz({ phone: "+972 3-555-1234" }))).toBe(true);
  });
  test("true for Israeli national mobile", () => {
    expect(isIsraelMarket(biz({ phone: "052-555-1234" }))).toBe(true);
  });
  test("true for an Israeli place in the address", () => {
    expect(isIsraelMarket(biz({ address: "12 Dizengoff, Tel Aviv" }))).toBe(true);
  });
  test("true for Hebrew name", () => {
    expect(isIsraelMarket(biz({ name: "קפה נמל" }))).toBe(true);
  });
  test("true for country tag IL", () => {
    expect(isIsraelMarket(biz({ tags: { "addr:country": "IL" } }))).toBe(true);
  });
  test("false for a US business", () => {
    expect(
      isIsraelMarket(biz({ address: "512 Vine St, Brooklyn, NY", phone: "+1 718-555-0142" })),
    ).toBe(false);
  });
});

describe("resolveLocale", () => {
  test("override wins", () => {
    expect(resolveLocale(biz({ address: "Tel Aviv" }), { override: "en" })).toBe("en");
  });
  test("market israel forces he", () => {
    expect(resolveLocale(biz({ address: "Brooklyn" }), { market: "israel" })).toBe("he");
  });
  test("auto-detects Israel → he, else en", () => {
    expect(resolveLocale(biz({ phone: "+972 3 1234567" }))).toBe("he");
    expect(resolveLocale(biz({ address: "Brooklyn, NY" }))).toBe("en");
  });
});

describe("strings", () => {
  test("Hebrew table is RTL and translated", () => {
    const he = stringsFor("he");
    expect(he.dir).toBe("rtl");
    expect(he.lang).toBe("he");
    expect(he.callUs).toBe("התקשרו אלינו");
    expect(he.visitHeading("Rosa")).toContain("Rosa");
  });
  test("English table is LTR", () => {
    expect(stringsFor("en").dir).toBe("ltr");
  });
});
