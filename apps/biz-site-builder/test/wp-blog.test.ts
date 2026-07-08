import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { stringsFor } from "../src/i18n/strings.ts";
import { generateWxr } from "../src/wordpress/wxr.ts";
import { blogPostBlocks } from "../src/wordpress/blocks.ts";
import { blogDrafts } from "../src/generate/blog.ts";

const he = stringsFor("he");
const en = stringsFor("en");

function biz(p: Partial<Business>): Business {
  return { id: "b", name: "מספרת רוטשילד", images: [], reviews: [], ...p };
}

describe("blog → WordPress", () => {
  test("blogPostBlocks renders Gutenberg blocks for a post body", () => {
    const draft = blogDrafts(biz({ category: "מספרה" }), he)[0]!;
    const blocks = blogPostBlocks(draft, he);
    expect(blocks).toContain("wp:heading");
    expect(blocks).toContain("wp:paragraph");
    expect(blocks).toContain("wp:list"); // the pricing list
  });

  test("generateWxr with blog adds post_type=post items", () => {
    const b = biz({ category: "מספרה", services: [{ name: "תספורת גבר", price: "₪80" }] });
    const withoutBlog = generateWxr(b, he);
    const withBlog = generateWxr(b, he, { blog: true });
    // No posts unless requested.
    expect(withoutBlog).not.toContain("CDATA[post]]");
    // Five posts added.
    expect((withBlog.match(/CDATA\[post\]\]/g) ?? []).length).toBe(5);
    // The pricing post carries the real menu price, as a WP post.
    expect(withBlog).toContain("תספורת גבר — ₪80");
    // Pages are still present (post_type=page).
    expect(withBlog).toContain("CDATA[page]]");
  });

  test("English trades also flow into WordPress posts", () => {
    const wxr = generateWxr(biz({ name: "Volt", category: "electrician" }), en, { blog: true });
    expect((wxr.match(/CDATA\[post\]\]/g) ?? []).length).toBe(5);
    expect(wxr).toContain("price guide");
  });
});
