import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { stringsFor } from "../src/i18n/strings.ts";
import { generateTheme } from "../src/wordpress/theme.ts";
import { heroBlock } from "../src/wordpress/blocks.ts";

const he = stringsFor("he");
const en = stringsFor("en");

function biz(p: Partial<Business>): Business {
  return { id: "b", name: "מספרת רוטשילד", images: [], reviews: [], ...p };
}

describe("classic WordPress theme (2015 feel)", () => {
  test("ships header + footer template parts and registers them", () => {
    const files = generateTheme(biz({ phone: "03-1", address: "רוטשילד 40, תל אביב" }), he);
    const paths = files.map((f) => f.path);
    expect(paths.some((p) => p.endsWith("parts/header.html"))).toBe(true);
    expect(paths.some((p) => p.endsWith("parts/footer.html"))).toBe(true);
    const themeJson = files.find((f) => f.path.endsWith("theme.json"))!.content;
    expect(JSON.parse(themeJson).templateParts).toHaveLength(2);
  });

  test("header is a classic nav bar: site title + page list + blog link", () => {
    const header = generateTheme(biz({}), he).find((f) =>
      f.path.endsWith("parts/header.html"),
    )!.content;
    expect(header).toContain("wp:site-title");
    expect(header).toContain("wp:page-list");
    expect(header).toContain("בלוג");
  });

  test("footer carries the real contact line", () => {
    const footer = generateTheme(biz({ phone: "03-555", address: "רוטשילד 40" }), he).find((f) =>
      f.path.endsWith("parts/footer.html"),
    )!.content;
    expect(footer).toContain("03-555");
    expect(footer).toContain("רוטשילד 40");
  });

  test("the photoless hero is restrained (no full-bleed vivid background)", () => {
    const hero = heroBlock(biz({ phone: "03-1" }), he);
    expect(hero).not.toContain("has-accent-background-color");
    expect(hero).not.toContain("has-white-color"); // dark text on the page bg, not white-on-color
    expect(hero).toContain("wp:separator"); // thin classic divider
  });

  test("a photo hero still uses a cover (timeless)", () => {
    const hero = heroBlock(biz({ images: ["https://x/p.jpg"] }), en);
    expect(hero).toContain("wp:cover");
  });
});
