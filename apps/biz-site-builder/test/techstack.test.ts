import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { detectTechStack } from "../src/website/techstack.ts";
import { detectWebsite, verifyLive } from "../src/website/detect.ts";
import { scoreLead } from "../src/generate/lead.ts";

describe("detectTechStack", () => {
  test("identifies WordPress from markup and picks WooCommerce as auxiliary", () => {
    const html = `<link href="/wp-content/themes/x/style.css"><meta name="generator" content="WordPress 6.5"><div class="woocommerce">`;
    const t = detectTechStack(html);
    expect(t.platform).toBe("WordPress");
    expect(t.technologies).toContain("WooCommerce");
    expect(t.weakBuilder).toBe(false);
  });

  test("flags DIY builders (Wix/Squarespace) as weak presence", () => {
    expect(detectTechStack('<script src="https://static.wixstatic.com/x.js">').weakBuilder).toBe(
      true,
    );
    expect(detectTechStack("", { server: "Squarespace" }).platform).toBe("Squarespace");
    expect(detectTechStack("", { server: "Squarespace" }).weakBuilder).toBe(true);
  });

  test("detects from headers (Shopify) and captures the server banner", () => {
    const t = detectTechStack("<html></html>", {
      "x-shopify-stage": "production",
      server: "nginx/1.25",
    });
    expect(t.platform).toBe("Shopify");
    expect(t.technologies).toContain("nginx");
  });

  test("returns no platform for a plain hand-coded page", () => {
    const t = detectTechStack("<html><body><h1>Joe</h1></body></html>");
    expect(t.platform).toBeUndefined();
    expect(t.weakBuilder).toBe(false);
    expect(t.outdated).toBe(false);
  });

  test("flags outdated/legacy tech (jQuery 1.x, Flash, WebForms)", () => {
    expect(detectTechStack('<script src="/js/jquery-1.11.3.min.js">').outdated).toBe(true);
    const flash = detectTechStack('<script src="swfobject.js"></script>');
    expect(flash.outdated).toBe(true);
    expect(flash.outdatedSignals).toContain("Adobe Flash");
    expect(
      detectTechStack('<input type="hidden" name="__VIEWSTATE" value="x">').outdatedSignals,
    ).toContain("ASP.NET WebForms");
  });
});

describe("verifyLive tech detection", () => {
  const biz: Business = {
    id: "x",
    name: "T",
    website: "https://shop.example",
    images: [],
    reviews: [],
  };
  const status = detectWebsite(biz);

  test("attaches platform/weakBuilder from the fetched body", async () => {
    const fetchImpl = (async () =>
      new Response('<div class="woocommerce"><link href="/wp-includes/x">', {
        status: 200,
        headers: { server: "nginx" },
      })) as unknown as typeof fetch;
    const s = await verifyLive(status, { fetchImpl });
    expect(s.hasWebsite).toBe(true);
    expect(s.platform).toBe("WordPress");
    expect(s.weakBuilder).toBeUndefined();
  });

  test("a live Wix site is flagged weak → lead score gets the weak-presence bump", async () => {
    const fetchImpl = (async () =>
      new Response('<script src="https://static.wixstatic.com/a.js"></script>', {
        status: 200,
      })) as unknown as typeof fetch;
    const s = await verifyLive(status, { fetchImpl });
    expect(s.platform).toBe("Wix");
    expect(s.weakBuilder).toBe(true);
    // With an existing site the base is 40; the weak-builder bump lifts it.
    expect(scoreLead(biz, s)).toBeGreaterThan(scoreLead(biz, { ...s, weakBuilder: false }));
  });
});
