import type { ListingEntry } from "./listing.ts";
import { xmlEsc } from "../wordpress/xml.ts";

/**
 * Emit a sitemaps.org `sitemap.xml` and a matching `robots.txt` for the
 * generated directory so crawlers discover every built site. `baseUrl` is where
 * the `<out>` directory will be hosted.
 */
export function generateSitemap(entries: ListingEntry[], baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const urls = ["index.html", ...entries.map((e) => e.sitePath ?? e.wpBundlePath).filter(Boolean)];
  const body = [...new Set(urls)]
    .map(
      (loc) =>
        `  <url>\n    <loc>${xmlEsc(`${base}/${loc}`)}</loc>\n    <changefreq>weekly</changefreq>\n  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export function generateRobots(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`;
}
