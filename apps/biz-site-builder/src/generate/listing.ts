import type { Business, WebsiteStatus } from "../types.ts";
import type { LocaleCode, Strings } from "../i18n/strings.ts";
import { stringsFor } from "../i18n/strings.ts";
import { esc, initials, paletteFor, safeUrl, stars } from "./util.ts";
import { extractKeywords } from "./keywords.ts";

export interface ListingEntry {
  business: Business;
  status: WebsiteStatus;
  /** Relative path to the generated site, if one was built. */
  sitePath?: string;
  /** Relative path to the generated promo video composition, if built. */
  videoPath?: string;
  /** Relative path to the generated WordPress deploy bundle directory. */
  wpBundlePath?: string;
  /** Relative path to a generated price quote, if built. */
  quotePath?: string;
  /** Lead score 0–100 for this business. */
  leadScore?: number;
  /** Locale the business's site/video were rendered in. */
  locale?: LocaleCode;
}

/** Machine-readable directory of everything the run produced. */
export function generateIndexJson(entries: ListingEntry[]): string {
  const data = entries.map((e) => ({
    id: e.business.id,
    name: e.business.name,
    category: e.business.category ?? null,
    address: e.business.address ?? null,
    source: e.business.source ?? null,
    existingWebsite: e.status.hasWebsite ? (e.status.url ?? null) : null,
    existingPlatform: e.status.platform ?? null,
    technologies: e.status.technologies ?? null,
    weakBuilder: e.status.weakBuilder ?? false,
    outdated: e.status.outdated ?? false,
    needsWebsite: !e.status.hasWebsite,
    reason: e.status.reason,
    imageCount: e.business.images.length,
    reviewCount: e.business.reviews.length,
    generatedSite: e.sitePath ?? null,
    generatedVideo: e.videoPath ?? null,
    generatedWordPress: e.wpBundlePath ?? null,
    generatedQuote: e.quotePath ?? null,
    leadScore: e.leadScore ?? null,
    locale: e.locale ?? "en",
    keywords: extractKeywords(e.business, stringsFor(e.locale ?? "en")).all,
  }));
  return JSON.stringify(data, null, 2) + "\n";
}

/** Human-browsable directory page listing every business and its outcome. */
export function generateIndexHtml(entries: ListingEntry[], s: Strings = stringsFor("en")): string {
  const needs = entries.filter((e) => !e.status.hasWebsite);
  const has = entries.filter((e) => e.status.hasWebsite);

  const card = (e: ListingEntry): string => {
    const p = paletteFor(e.business);
    const b = e.business;
    const links = [
      e.sitePath && `<a class="pill" href="${esc(e.sitePath)}">${esc(s.openSite)}</a>`,
      e.wpBundlePath && `<a class="pill wp" href="${esc(e.wpBundlePath)}">WordPress ▾</a>`,
      e.quotePath &&
        `<a class="pill quote" href="${esc(e.quotePath)}">${s.code === "he" ? "הצעת מחיר" : "Quote"}</a>`,
      e.videoPath && `<a class="pill ghost" href="${esc(e.videoPath)}">${esc(s.promoVideo)}</a>`,
      e.status.hasWebsite &&
        e.status.url &&
        `<a class="pill ghost" href="${esc(safeUrl(e.status.url))}" target="_blank" rel="noopener">${esc(s.existingSite)}</a>`,
    ]
      .filter(Boolean)
      .join(" ");
    return `<article class="card"${e.locale ? ` lang="${e.locale}"` : ""}>
      <div class="ava" style="background:linear-gradient(135deg, ${p.accentDeep}, #12141a)">${esc(initials(b.name))}</div>
      <div class="body">
        <h3>${esc(b.name)}</h3>
        <div class="meta">${[esc(b.category ?? ""), esc(b.address ?? "")].filter(Boolean).join(" · ")}</div>
        <div class="tags">
          ${b.rating !== undefined ? `<span class="tag">${stars(b.rating)} ${b.rating.toFixed(1)}</span>` : ""}
          <span class="tag">${esc(s.reviewsCount(b.reviews.length))}</span>
          <span class="tag">${esc(s.photosCount(b.images.length))}</span>
          <span class="tag ${e.status.hasWebsite ? "ok" : "warn"}">${esc(e.status.hasWebsite ? s.hasWebsiteTag : s.needsWebsiteTag)}</span>
          ${e.status.platform ? `<span class="tag plat${e.status.weakBuilder || e.status.outdated ? " weak" : ""}">${esc(e.status.platform)}</span>` : ""}
          ${e.status.outdated ? `<span class="tag weak">${s.code === "he" ? "מיושן" : "outdated"}</span>` : ""}
          ${e.leadScore !== undefined ? `<span class="tag lead">${s.code === "he" ? "ליד" : "lead"} ${e.leadScore}</span>` : ""}
          ${e.locale === "he" ? `<span class="tag lang">עברית</span>` : ""}
        </div>
        <div class="links">${links || '<span class="muted">—</span>'}</div>
      </div>
    </article>`;
  };

  const section = (title: string, list: ListingEntry[]): string =>
    list.length
      ? `<h2>${esc(title)} <span class="count">${list.length}</span></h2><div class="grid">${list.map(card).join("\n")}</div>`
      : "";

  return `<!doctype html>
<html lang="${s.lang}" dir="${s.dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(s.directoryTitle)} — ${entries.length}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #0d0f16; color: #eef; padding: 48px 24px; }
      .wrap { max-width: 1100px; margin: 0 auto; }
      header h1 { font-size: 34px; letter-spacing: -0.02em; }
      header p { opacity: .6; margin-top: 8px; }
      .stats { display: flex; gap: 28px; margin: 28px 0 40px; flex-wrap: wrap; }
      .stat { background: #161a26; border: 1px solid #232838; border-radius: 14px; padding: 16px 22px; }
      .stat b { font-size: 30px; display: block; }
      .stat span { opacity: .6; font-size: 13px; }
      h2 { margin: 40px 0 18px; font-size: 22px; }
      h2 .count { opacity: .5; font-size: 16px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
      .card { display: flex; gap: 16px; background: #141824; border: 1px solid #232838; border-radius: 16px; padding: 18px; }
      .ava { flex: none; width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 20px; color: #fff; }
      .body { min-width: 0; }
      .card h3 { font-size: 18px; }
      .meta { opacity: .6; font-size: 14px; margin: 4px 0 10px; }
      .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
      .tag { font-size: 12px; padding: 3px 9px; border-radius: 999px; background: #222838; }
      .tag.ok { background: #16351f; color: #9be8ad; }
      .tag.warn { background: #3a2a12; color: #f4c079; }
      .tag.lang { background: #1e2a44; color: #a9c5ff; }
      .tag.lead { background: #2a2340; color: #c9b8f0; }
      .tag.plat { background: #1f3330; color: #a7e0d0; }
      .tag.weak { background: #3a2a12; color: #f4c079; }
      .links { display: flex; gap: 8px; flex-wrap: wrap; }
      .pill { font-size: 13px; font-weight: 600; text-decoration: none; padding: 8px 14px; border-radius: 999px; background: #3552cc; color: #fff; }
      .pill.wp { background: #1d6a8f; color: #fff; }
      .pill.quote { background: #6d4bb8; color: #fff; }
      .pill.ghost { background: transparent; border: 1px solid #384056; color: #cdd6f4; }
      .muted { opacity: .4; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <h1>${esc(s.directoryTitle)}</h1>
        <p>${esc(s.directorySubtitle(entries.length))}</p>
      </header>
      <div class="stats">
        <div class="stat"><b>${entries.length}</b><span>${esc(s.businessesListed)}</span></div>
        <div class="stat"><b>${needs.length}</b><span>${esc(s.neededWebsite)}</span></div>
        <div class="stat"><b>${has.length}</b><span>${esc(s.alreadyHad)}</span></div>
      </div>
      <main>
      ${section(s.sectionBuilt, needs)}
      ${section(s.sectionHasSite, has)}
      </main>
    </div>
  </body>
</html>
`;
}
