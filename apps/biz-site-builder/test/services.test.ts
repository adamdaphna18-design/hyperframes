import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { stringsFor } from "../src/i18n/strings.ts";
import { glyphFor, isStarterMenu, servicesFor } from "../src/generate/services.ts";
import { generateSite } from "../src/generate/site.ts";
import { servicesBlock } from "../src/wordpress/blocks.ts";

const en = stringsFor("en");
const he = stringsFor("he");

function biz(p: Partial<Business>): Business {
  return { id: "b", name: "Biz", images: [], reviews: [], ...p };
}

describe("service menus", () => {
  test("a barber gets a barber-specific starter menu (EN + HE)", () => {
    const enItems = servicesFor(biz({ category: "Barbershop" }), en);
    expect(enItems.some((i) => /haircut/i.test(i.name))).toBe(true);
    expect(enItems.every((i) => i.price)).toBe(true);
    const heItems = servicesFor(biz({ category: "מספרה" }), he);
    expect(heItems.some((i) => i.name.includes("תספורת"))).toBe(true);
  });
  test("distinct trades get distinct menus", () => {
    expect(
      servicesFor(biz({ category: "Restaurant" }), en).some((i) => /lunch|mains/i.test(i.name)),
    ).toBe(true);
    expect(servicesFor(biz({ category: "Gym" }), en).some((i) => /membership/i.test(i.name))).toBe(
      true,
    );
  });
  test("owner-supplied services win over the starter menu", () => {
    const b = biz({ category: "מספרה", services: [{ name: "Fade", price: "₪90" }] });
    expect(servicesFor(b, en)).toEqual([{ name: "Fade", price: "₪90" }]);
    expect(isStarterMenu(b)).toBe(false);
    expect(isStarterMenu(biz({ category: "מספרה" }))).toBe(true);
  });
  test("glyph identity per trade", () => {
    expect(glyphFor(biz({ category: "Barbershop" }), en)).toBe("💈");
    expect(glyphFor(biz({ category: "Restaurant" }), en)).toBe("🍽️");
  });
});

describe("services render into both outputs", () => {
  test("the static site shows the price menu and starter note", () => {
    const html = generateSite(biz({ name: "מספרת רוטשילד", category: "מספרה" }), he);
    expect(html).toContain("השירותים שלנו");
    expect(html).toContain("תספורת גבר");
    expect(html).toContain("₪80");
    expect(html).toContain("מחירון לדוגמה"); // starter-menu note
  });
  test("a photoless site gets a glyph placeholder instead of an empty gallery", () => {
    const html = generateSite(biz({ name: "Cuts", category: "barber" }), en);
    expect(html).toContain("gallery placeholder");
    expect(html).toContain("💈");
  });
  test("the WordPress home block includes the services list", () => {
    const block = servicesBlock(biz({ category: "מספרה" }), he);
    expect(block).toContain("wp:list");
    expect(block).toContain("תספורת גבר");
    expect(block).toContain("<strong>₪80</strong>");
  });
});
