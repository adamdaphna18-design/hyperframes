import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";
import { stringsFor } from "../i18n/strings.ts";
import { bestReview, esc, initials, outputSlug, paletteFor, stars, taglineFor } from "./util.ts";
import { jsonLdScripts } from "./schema.ts";
import { hasMap, leafletAssets, leafletMap } from "./map.ts";
import { headMeta, seoTitle, type MetaContext } from "./meta.ts";
import { hoursTableHtml, parseOpeningHours } from "./hours.ts";
import { analyticsSnippet, type AnalyticsOptions } from "./analytics.ts";
import { chatWidgetSnippet, hasChatWidget, type ChatWidgetOptions } from "./chatwidget.ts";
import { extractKeywords } from "./keywords.ts";
import { cityOf } from "./meta.ts";

export interface SiteOptions {
  /** Absolute site root for canonical/OG URLs, e.g. https://dir.example. */
  baseUrl?: string;
  /** This page's path under baseUrl, e.g. sites/rosa.html. */
  path?: string;
  /** Brand suffix for the <title>. */
  brand?: string;
  /** URL of the generated branded OG image for this page. */
  ogImage?: string;
  /** Analytics providers to inject (GA4 / Plausible). */
  analytics?: AnalyticsOptions;
  /** Embed an AI chat widget (the "AI Agent" service deliverable). */
  chatWidget?: ChatWidgetOptions;
}

/**
 * Generate a self-contained, responsive one-page website for a business from
 * its profile, images and community reviews. No external CSS/JS — the file is
 * portable and can be dropped on any static host. Fully localised: pass the
 * Hebrew string table and the document renders right-to-left in Hebrew.
 */
export function generateSite(
  business: Business,
  s: Strings = stringsFor("en"),
  opts: SiteOptions = {},
): string {
  const keywords = extractKeywords(business, s);
  const meta: MetaContext = {
    locale: s,
    baseUrl: opts.baseUrl,
    path: opts.path,
    brand: opts.brand,
    ogImage: opts.ogImage,
    keywords: keywords.all,
  };
  const p = paletteFor(business);
  const tagline = taglineFor(business, s);
  const mapsQuery = encodeURIComponent(business.address ?? business.name);
  const telHref = business.phone ? business.phone.replace(/[^+\d]/g, "") : "";
  // Keyword-rich, descriptive image alt text (name + top keyword + city).
  const city = cityOf(business);
  const altBase = [
    business.name,
    keywords.primary[0],
    city && (s.code === "he" ? `ב${city}` : `in ${city}`),
  ]
    .filter(Boolean)
    .join(" — ");

  const gallery = business.images.length
    ? `<section class="gallery" id="gallery" aria-label="${esc(s.photosCount(business.images.length))}">
        ${business.images
          .slice(0, 8)
          .map(
            (src, i) =>
              `<figure><img loading="lazy" src="${esc(src)}" alt="${esc(`${altBase}${i > 0 ? ` (${i + 1})` : ""}`)}" /></figure>`,
          )
          .join("\n        ")}
      </section>`
    : "";

  const reviews = business.reviews.length
    ? `<section class="reviews" id="reviews" aria-label="${esc(s.whatPeopleSay)}">
        <h2>${esc(s.whatPeopleSay)}</h2>
        <div class="review-grid">
          ${business.reviews
            .slice(0, 6)
            .map(
              (r) => `<blockquote>
            ${r.rating !== undefined ? `<div class="stars" aria-label="${r.rating}/5">${stars(r.rating)}</div>` : ""}
            <p>${esc(r.text)}</p>
            ${r.author ? `<cite>— ${esc(r.author)}</cite>` : ""}
          </blockquote>`,
            )
            .join("\n          ")}
        </div>
      </section>`
    : "";

  const contactRows = [
    business.address &&
      `<li><span>${esc(s.addressLabel)}</span><a href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" rel="noopener">${esc(business.address)}</a></li>`,
    business.phone &&
      `<li><span>${esc(s.phoneLabel)}</span><a href="tel:${esc(telHref)}">${esc(business.phone)}</a></li>`,
    business.email &&
      `<li><span>${esc(s.emailLabel)}</span><a href="mailto:${esc(business.email)}">${esc(business.email)}</a></li>`,
    business.hours &&
      `<li><span>${esc(s.hoursLabel)}</span><span>${hoursValue(business.hours, s)}</span></li>`,
  ]
    .filter(Boolean)
    .join("\n          ");

  const hero = business.images[0]
    ? `background-image: linear-gradient(180deg, rgba(0,0,0,.40), rgba(0,0,0,.78)), url('${esc(business.images[0])}');`
    : `background: radial-gradient(120% 120% at 30% 20%, ${p.accentDeep}, #0a0a0f);`;

  return `<!doctype html>
<html lang="${s.lang}" dir="${s.dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(seoTitle(business, meta))}</title>
    ${headMeta(business, meta)}
    ${jsonLdScripts(business, s, { baseUrl: opts.baseUrl, path: opts.path, keywords: keywords.all })}
    ${opts.analytics ? analyticsSnippet(business, opts.analytics) : ""}
    ${hasMap(business) ? leafletAssets() : ""}
    <style>
      :root {
        --accent: ${p.accent};
        --accent-deep: ${p.accentDeep};
        --accent-ink: ${p.accentInk};
        --ink: ${p.ink};
        --bg: ${p.bg};
        --surface: ${p.surface};
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        color: var(--ink);
        background: var(--bg);
        line-height: 1.55;
      }
      a { color: var(--accent-ink); }
      .wrap { max-width: 1040px; margin: 0 auto; padding: 0 24px; }
      header.hero {
        min-height: 62vh; display: flex; align-items: flex-end; color: #fff;
        ${hero}
        background-size: cover; background-position: center;
      }
      .hero .wrap { padding-bottom: 56px; padding-top: 56px; }
      .badge {
        display: inline-flex; align-items: center; justify-content: center;
        width: 68px; height: 68px; border-radius: 18px; font-weight: 800; font-size: 26px;
        background: rgba(255,255,255,.16); backdrop-filter: blur(6px); margin-bottom: 20px;
        border: 1px solid rgba(255,255,255,.25);
      }
      .hero h1 { font-size: clamp(34px, 6vw, 62px); line-height: 1.05; letter-spacing: -0.02em; }
      .hero .tagline { font-size: clamp(17px, 2.4vw, 22px); margin-top: 14px; max-width: 42ch; opacity: .95; }
      .hero .rating { margin-top: 16px; font-weight: 600; }
      .cta-row { margin-top: 28px; display: flex; gap: 12px; flex-wrap: wrap; }
      .btn {
        display: inline-block; padding: 13px 22px; border-radius: 999px; font-weight: 700;
        text-decoration: none; transition: transform .12s ease;
      }
      .btn:hover { transform: translateY(-2px); }
      .btn-primary { background: #fff; color: var(--ink); }
      .btn-ghost { background: rgba(0,0,0,.34); color: #fff; border: 1px solid rgba(255,255,255,.6); }
      section { padding: 64px 0; }
      section h2 { font-size: clamp(24px, 4vw, 34px); margin-bottom: 24px; letter-spacing: -0.01em; }
      .about p { font-size: 18px; max-width: 62ch; }
      .gallery {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 12px; padding: 24px 0;
      }
      .gallery .wrap { display: contents; }
      .gallery figure { overflow: hidden; border-radius: 14px; aspect-ratio: 4 / 3; background: #e7e7ee; }
      .gallery img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .reviews { background: var(--surface); }
      .review-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; }
      blockquote {
        background: var(--bg); border-radius: 16px; padding: 22px; border: 1px solid rgba(0,0,0,.06);
      }
      blockquote .stars { color: var(--accent-ink); letter-spacing: 2px; margin-bottom: 8px; }
      blockquote cite { display: block; margin-top: 12px; font-style: normal; font-weight: 600; opacity: .7; }
      .contact ul { list-style: none; display: grid; gap: 14px; max-width: 560px; }
      .contact li { display: grid; grid-template-columns: 110px 1fr; gap: 16px; align-items: baseline; }
      .contact li span:first-child { font-weight: 700; color: #565d6b; text-transform: uppercase; font-size: 13px; letter-spacing: .06em; }
      table.hours { border-collapse: collapse; font-size: 15px; }
      table.hours th { text-align: start; font-weight: 600; padding: 2px 18px 2px 0; opacity: .85; }
      table.hours td { padding: 2px 0; }
      table.hours .closed { opacity: .5; }
      footer { padding: 40px 0; color: #4b5160; font-size: 14px; border-top: 1px solid rgba(0,0,0,.08); }
      footer .built { color: #565d6b; }
    </style>
  </head>
  <body>
    <header class="hero">
      <div class="wrap">
        <div class="badge" aria-hidden="true">${esc(initials(business.name))}</div>
        <h1>${esc(business.name)}</h1>
        <p class="tagline">${esc(tagline)}</p>
        ${business.rating !== undefined ? `<div class="rating">${stars(business.rating)} ${business.rating.toFixed(1)}</div>` : ""}
        <div class="cta-row">
          ${business.phone ? `<a class="btn btn-primary" href="tel:${esc(telHref)}">${esc(s.callUs)}</a>` : ""}
          ${business.address ? `<a class="btn btn-ghost" href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" rel="noopener">${esc(s.getDirections)}</a>` : `<a class="btn btn-ghost" href="#contact">${esc(s.contact)}</a>`}
        </div>
      </div>
    </header>

    <main>
      ${
        business.description
          ? `<section class="about"><div class="wrap"><h2>${esc(s.about)}</h2><p>${esc(business.description)}</p></div></section>`
          : ""
      }
      ${gallery ? `<div class="wrap">${gallery}</div>` : ""}
      ${reviews ? `<div class="wrap">${reviews}</div>` : ""}
      <section class="contact" id="contact">
        <div class="wrap">
          <h2>${esc(s.visitHeading(business.name))}</h2>
          <ul>
          ${contactRows || `<li><span>${esc(s.contact)}</span><span>${esc(s.contactFallback)}</span></li>`}
          </ul>
          ${business.location ? `<div style="margin-top:28px">${leafletMap(business.location, business.name)}</div>` : ""}
        </div>
      </section>
    </main>

    <footer>
      <div class="wrap">
        <div>© ${esc(business.name)}${business.category ? ` · ${esc(business.category)}` : ""}</div>
        <div class="built">${esc(s.builtBy(!!bestReview(business)))}</div>
      </div>
    </footer>
    ${hasChatWidget(opts.chatWidget) ? chatWidgetSnippet(opts.chatWidget, s.dir) : ""}
  </body>
</html>
`;
}

export function siteSlug(business: Business): string {
  return outputSlug(business);
}

/** Render hours as a structured table when parseable, else the raw string. */
function hoursValue(hours: string, s: Strings): string {
  const week = parseOpeningHours(hours);
  return week ? hoursTableHtml(week, s) : esc(hours);
}
