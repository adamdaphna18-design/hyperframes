/**
 * Deterministic SEO / HTML-quality audit — the durable, browser-free half of a
 * Lighthouse SEO run, enforced as a fast regression gate over generated HTML.
 * (Live Lighthouse performance scores are environment-sensitive and depend on
 * CDN assets loading, so they're unsuitable as a hard gate here; this checks the
 * on-page signals that are fully determined by our output.)
 */

export interface SeoReport {
  errors: string[];
  warnings: string[];
  passed: boolean;
}

export interface SeoOptions {
  /** Require a <link rel="canonical"> (set when the build has a base URL). */
  expectCanonical?: boolean;
}

function metaContent(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return undefined;
}

/** Audit a single generated HTML document against the on-page SEO checklist. */
export function auditSeo(html: string, opts: SeoOptions = {}): SeoReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  if (!title) errors.push("missing <title>");
  else if (title.length > 70) warnings.push(`<title> is ${title.length} chars (>70)`);

  const desc = metaContent(html, "description");
  if (desc === undefined) errors.push("missing meta description");
  else if (desc.length > 160) warnings.push(`meta description is ${desc.length} chars (>160)`);

  const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
  if (h1Count === 0) errors.push("no <h1>");
  else if (h1Count > 1) errors.push(`multiple <h1> (${h1Count})`);

  if (!/<html[^>]+\blang=/i.test(html)) errors.push("missing <html lang>");
  if (!/name=["']viewport["']/i.test(html)) errors.push("missing viewport meta");
  if (!/application\/ld\+json/i.test(html)) errors.push("missing JSON-LD structured data");

  // Every image needs non-empty alt text.
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const missingAlt = imgs.filter((img) => {
    const alt = img.match(/\balt=["']([^"']*)["']/i)?.[1];
    return !alt || !alt.trim();
  }).length;
  if (missingAlt) errors.push(`${missingAlt} <img> without alt text`);

  if (!metaContent(html, "og:title")) warnings.push("missing og:title");
  if (!metaContent(html, "og:image")) warnings.push("missing og:image");
  if (opts.expectCanonical && !/rel=["']canonical["']/i.test(html)) {
    warnings.push("missing canonical link");
  }

  return { errors, warnings, passed: errors.length === 0 };
}

export function formatSeoReport(file: string, r: SeoReport): string {
  const flag = r.passed ? "✓" : "✗";
  const parts: string[] = [];
  if (r.errors.length) parts.push(`errors: ${r.errors.join("; ")}`);
  if (r.warnings.length) parts.push(`warnings: ${r.warnings.join("; ")}`);
  return `${flag} ${file}${parts.length ? " — " + parts.join(" | ") : " — clean"}`;
}
