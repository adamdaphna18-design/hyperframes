import { describe, expect, test } from "bun:test";
import type { Business } from "../src/types.ts";
import { stringsFor } from "../src/i18n/strings.ts";
import { generateWxr } from "../src/wordpress/wxr.ts";
import { resolvePluginsStatic, resolvePlugins, pluginSearchUrl } from "../src/wordpress/plugins.ts";
import { generateTheme, themeSlug } from "../src/wordpress/theme.ts";
import { generateProvisionScript } from "../src/wordpress/provision.ts";
import { generateComposerJson } from "../src/wordpress/composer.ts";
import { generateWordPressBundle } from "../src/wordpress/bundle.ts";

const en = stringsFor("en");
const he = stringsFor("he");

const rosa: Business = {
  id: "rosa",
  name: "Rosa's Trattoria",
  category: "Italian Restaurant",
  description: "Family-run trattoria serving hand-made pasta.",
  address: "512 Vine St, Brooklyn, NY",
  phone: "+1 718-555-0142",
  website: null,
  images: ["https://img.example/a.jpg", "https://img.example/b.jpg"],
  reviews: [{ author: "Maria", rating: 5, text: "Best pasta <ever>" }],
  rating: 4.7,
};

describe("generateWxr", () => {
  const xml = generateWxr(rosa, en);
  test("has an XML declaration and a single rss root", () => {
    expect(xml.startsWith("<?xml")).toBe(true);
    expect(xml.trimEnd().endsWith("</rss>")).toBe(true);
    expect((xml.match(/<channel>/g) ?? []).length).toBe(1);
    expect((xml.match(/<\/item>/g) ?? []).length).toBe(4);
  });
  test("declares WXR 1.2 and the wp namespace", () => {
    expect(xml).toContain("<wp:wxr_version>1.2</wp:wxr_version>");
    expect(xml).toContain('xmlns:wp="http://wordpress.org/export/1.2/"');
  });
  test("contains the four pages", () => {
    for (const slug of ["home", "about", "reviews", "contact"]) {
      expect(xml).toContain(`<wp:post_name><![CDATA[${slug}]]></wp:post_name>`);
    }
  });
  test("reviews become approved comments (untrusted text is CDATA-wrapped)", () => {
    expect(xml).toContain("Best pasta <ever>");
    expect(xml).toContain("<wp:comment_approved><![CDATA[1]]></wp:comment_approved>");
  });
  test("Hebrew sets language he-IL", () => {
    expect(generateWxr(rosa, he)).toContain("<language>he-IL</language>");
  });
});

describe("resolvePluginsStatic", () => {
  test("always includes SEO + contact + cache", () => {
    const slugs = resolvePluginsStatic(rosa).map((p) => p.slug);
    expect(slugs).toContain("wordpress-seo");
    expect(slugs).toContain("contact-form-7");
  });
  test("restaurant gets reservations, reviews get testimonials", () => {
    const slugs = resolvePluginsStatic(rosa).map((p) => p.slug);
    expect(slugs).toContain("restaurant-reservations");
    expect(slugs).toContain("strong-testimonials");
  });
  test("retail gets woocommerce", () => {
    const shop: Business = { ...rosa, category: "Book Store", reviews: [] };
    expect(resolvePluginsStatic(shop).map((p) => p.slug)).toContain("woocommerce");
  });
});

describe("resolvePlugins (live)", () => {
  test("appends a WP.org API match when live", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ plugins: [{ slug: "some-menu-plugin" }] }), {
        status: 200,
      })) as unknown as typeof fetch;
    const slugs = (await resolvePlugins(rosa, { live: true, fetchImpl })).map((p) => p.slug);
    expect(slugs).toContain("some-menu-plugin");
  });
  test("search URL targets the WP.org plugins API", () => {
    expect(pluginSearchUrl("cafe")).toContain("api.wordpress.org/plugins/info/1.2/");
  });
});

describe("generateTheme", () => {
  const files = generateTheme(rosa, en);
  test("emits style.css, theme.json, front-page template", () => {
    const paths = files.map((f) => f.path);
    expect(paths).toContain(`theme/${themeSlug(rosa)}/style.css`);
    expect(paths.some((p) => p.endsWith("theme.json"))).toBe(true);
    expect(paths.some((p) => p.endsWith("templates/front-page.html"))).toBe(true);
  });
  test("style.css declares the base template", () => {
    const style = files.find((f) => f.path.endsWith("style.css"))!.content;
    expect(style).toContain("Template: twentytwentyfour");
  });
  test("theme.json is valid JSON with a palette", () => {
    const themeJson = JSON.parse(files.find((f) => f.path.endsWith("theme.json"))!.content);
    expect(
      themeJson.settings.color.palette.some((c: { slug: string }) => c.slug === "accent"),
    ).toBe(true);
  });
});

describe("provision + composer", () => {
  const plugins = resolvePluginsStatic(rosa);
  test("provision installs core, imports content, sets front page", () => {
    const sh = generateProvisionScript(rosa, en, { plugins, baseTheme: "twentytwentyfour" });
    expect(sh).toContain("wp core download");
    expect(sh).toContain("wp import content.wxr.xml");
    expect(sh).toContain("wp plugin install wordpress-seo");
  });
  test("Hebrew provision installs he_IL language", () => {
    const sh = generateProvisionScript(rosa, he, { plugins, baseTheme: "twentytwentyfour" });
    expect(sh).toContain("wp language core install he_IL");
  });
  test("composer.json uses roots/wordpress + wpackagist", () => {
    const composer = JSON.parse(
      generateComposerJson(rosa, { plugins, baseTheme: "twentytwentyfour" }),
    );
    expect(composer.require["roots/wordpress"]).toBeTruthy();
    expect(composer.require["wpackagist-plugin/wordpress-seo"]).toBe("*");
    expect(composer.repositories[0].url).toBe("https://wpackagist.org");
  });
});

describe("generateWordPressBundle", () => {
  test("assembles a full, deployable bundle", async () => {
    const bundle = await generateWordPressBundle(rosa, { strings: en });
    const paths = bundle.files.map((f) => f.path);
    expect(paths).toContain("content.wxr.xml");
    expect(paths).toContain("provision.sh");
    expect(paths).toContain("composer.json");
    expect(paths).toContain("plugins.json");
    expect(paths).toContain("README.md");
    expect(bundle.files.find((f) => f.path === "provision.sh")!.executable).toBe(true);
    expect(bundle.locale).toBe("en");
  });
  test("Hebrew bundle is marked he", async () => {
    const bundle = await generateWordPressBundle(rosa, { strings: he });
    expect(bundle.locale).toBe("he");
  });
});
