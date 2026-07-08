import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { stringsFor } from "../src/i18n/strings.ts";
import { generateBlog } from "../src/generate/blog.ts";

const en = stringsFor("en");
const he = stringsFor("he");

function biz(p: Partial<Business>): Business {
  return { id: "b", name: "Biz", images: [], reviews: [], ...p };
}

describe("SEO blog generator", () => {
  test("produces an index + a set of ready articles per trade", () => {
    const { index, posts } = generateBlog(biz({ name: "Cuts", category: "barber" }), en);
    expect(posts.length).toBeGreaterThanOrEqual(5);
    expect(index).toContain("Blog");
    for (const post of posts) {
      expect(post.html.startsWith("<!doctype html>")).toBe(true);
      expect(post.title.length).toBeGreaterThan(0);
      expect(post.keywords.length).toBeGreaterThan(0);
      // Blog index links each post.
      expect(index).toContain(`./${post.slug}.html`);
    }
  });

  test("the pricing article uses the trade's real price menu", () => {
    const b = biz({
      name: "מספרת רוטשילד",
      category: "מספרה",
      services: [{ name: "תספורת גבר", price: "₪80" }],
    });
    const pricing = generateBlog(b, he).posts.find((p) => p.slug.includes("pricing"))!;
    expect(pricing.html).toContain("תספורת גבר — ₪80");
  });

  test("every post is internally linked (backlinks to site, services, contact, siblings)", () => {
    const { posts } = generateBlog(biz({ name: "Cuts", category: "barber" }), en, {
      homeHref: "../cuts.html",
    });
    const post = posts[0]!;
    expect(post.html).toContain('href="../cuts.html#contact"');
    expect(post.html).toContain('href="../cuts.html#services"');
    expect(post.html).toContain("./index.html"); // blog index
    // Links to at least one sibling post.
    expect(post.html).toMatch(/\.\/post-\d/);
  });

  test("emits valid Article JSON-LD (not HTML-escaped)", () => {
    const post = generateBlog(biz({ name: 'A "B" barber', category: "barber" }), en).posts[0]!;
    const m = post.html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n\s*<\/script>/);
    expect(m).not.toBeNull();
    const json = JSON.parse(m![1]!.replace(/\\u003c/g, "<"));
    expect(json["@type"]).toBe("Article");
    expect(json.headline.length).toBeGreaterThan(0);
    // Not corrupted by esc().
    expect(post.html).not.toContain("&quot;@type&quot;");
  });

  test("localizes to Hebrew (RTL) with year in the pricing guide", () => {
    const { posts } = generateBlog(biz({ name: "מספרה", category: "מספרה" }), he);
    const pricing = posts.find((p) => p.slug.includes("pricing"))!;
    expect(pricing.html).toContain('dir="rtl"');
    expect(pricing.title).toContain("2026");
  });
});
