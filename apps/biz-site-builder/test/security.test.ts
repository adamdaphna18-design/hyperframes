import { describe, expect, test } from "bun:test";
import { cssUrl, safeUrl } from "../src/generate/util.ts";
import { generateSite } from "../src/generate/site.ts";
import { generateIndexHtml } from "../src/generate/listing.ts";
import type { Business, WebsiteStatus } from "../src/types.ts";
import { stringsFor } from "../src/i18n/strings.ts";

const en = stringsFor("en");

describe("safeUrl", () => {
  test("passes through http/https/mailto/tel and relative paths", () => {
    expect(safeUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(safeUrl("http://example.com")).toBe("http://example.com");
    expect(safeUrl("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(safeUrl("tel:+972501234567")).toBe("tel:+972501234567");
    expect(safeUrl("sites/rosa.html")).toBe("sites/rosa.html");
    expect(safeUrl("#contact")).toBe("#contact");
  });
  test("collapses active/unknown schemes to #", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("#");
    expect(safeUrl("JavaScript:alert(1)")).toBe("#");
    expect(safeUrl(" javascript:alert(1)")).toBe("#"); // leading space
    expect(safeUrl("vbscript:msgbox(1)")).toBe("#");
    expect(safeUrl("data:text/html,<script>x</script>")).toBe("#"); // data disallowed by default
  });
  test("defeats control-char scheme obfuscation", () => {
    expect(safeUrl("jav\tascript:alert(1)")).toBe("#");
    expect(safeUrl("java\nscript:alert(1)")).toBe("#");
  });
  test("allows data: only when opted in", () => {
    expect(safeUrl("data:image/png;base64,AAAA", { allowData: true })).toBe(
      "data:image/png;base64,AAAA",
    );
  });
});

describe("cssUrl", () => {
  test("percent-encodes quotes/parens so it can't break out of url()", () => {
    const out = cssUrl("https://x/a'b\").png");
    expect(out).not.toContain("'");
    expect(out).not.toContain('"');
    expect(out).not.toContain(")");
    expect(out.startsWith("https://x/")).toBe(true);
  });
  test("blocks active schemes in CSS context", () => {
    expect(cssUrl("javascript:alert(1)")).toBe("#");
  });
});

function biz(p: Partial<Business>): Business {
  return { id: "b", name: "Biz", images: [], reviews: [], ...p };
}

describe("no XSS from untrusted business URLs", () => {
  test("a javascript: existing-site URL is neutralized in the directory", () => {
    const entries = [
      {
        business: biz({ name: "Evil Co" }),
        status: {
          hasWebsite: true,
          url: "javascript:alert(document.cookie)",
          reason: "owned",
        } as WebsiteStatus,
        locale: "en" as const,
      },
    ];
    const html = generateIndexHtml(entries, en);
    expect(html).not.toContain("javascript:alert");
    expect(html).toContain('href="#"');
  });
  test("a javascript: image URL never lands in a src or background", () => {
    const b = biz({ name: "Shop", images: ["javascript:alert(1)"] });
    const html = generateSite(b, en);
    expect(html).not.toContain("javascript:alert");
  });
  test("an image URL with a quote can't break out of the hero url()", () => {
    const b = biz({ name: "Shop", images: ["https://x/p'.jpg);}body{display:none}"] });
    const html = generateSite(b, en);
    // The raw breakout sequence must not appear verbatim in the CSS.
    expect(html).not.toContain("');}body{display:none}");
  });
});
