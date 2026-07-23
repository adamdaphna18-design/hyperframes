import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { stringsFor } from "../src/i18n/strings.ts";
import { carePlanFor, carePlanHtml } from "../src/generate/careplan.ts";

const en = stringsFor("en");
const he = stringsFor("he");

function biz(p: Partial<Business>): Business {
  return { id: "b", name: "מספרת רוטשילד", images: [], reviews: [], ...p };
}

describe("retention care plan", () => {
  test("offers three ascending recurring tiers, one featured", () => {
    const tiers = carePlanFor(biz({}), en);
    expect(tiers.map((t) => t.key)).toEqual(["care", "grow", "scale"]);
    expect(tiers[0]!.monthly).toBeLessThan(tiers[1]!.monthly);
    expect(tiers[1]!.monthly).toBeLessThan(tiers[2]!.monthly);
    expect(tiers.filter((t) => t.featured)).toHaveLength(1);
    // Higher tiers include the lower one.
    expect(tiers[1]!.includes.some((x) => /Care|בסיס/.test(x))).toBe(true);
  });

  test("renders a localized (RTL) proposal with prices and the featured ribbon", () => {
    const html = carePlanHtml(biz({ category: "מספרה" }), he, { brand: "סטודיו דנה" });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("₪149");
    expect(html).toContain("₪899");
    expect(html).toContain("הכי פופולרי"); // featured ribbon
    expect(html).toContain("סטודיו דנה");
  });

  test("escapes untrusted brand/name input", () => {
    const html = carePlanHtml(biz({ name: "A&B <x>" }), en);
    expect(html).toContain("A&amp;B &lt;x&gt;");
    expect(html).not.toContain("<x>");
  });
});
