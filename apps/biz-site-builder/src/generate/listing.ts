import type { Business, WebsiteStatus } from "../types.ts";
import { esc, initials, paletteFor, stars } from "./util.ts";

export interface ListingEntry {
  business: Business;
  status: WebsiteStatus;
  /** Relative path to the generated site, if one was built. */
  sitePath?: string;
  /** Relative path to the generated promo video composition, if built. */
  videoPath?: string;
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
    needsWebsite: !e.status.hasWebsite,
    reason: e.status.reason,
    imageCount: e.business.images.length,
    reviewCount: e.business.reviews.length,
    generatedSite: e.sitePath ?? null,
    generatedVideo: e.videoPath ?? null,
  }));
  return JSON.stringify(data, null, 2) + "\n";
}

/** Human-browsable directory page listing every business and its outcome. */
export function generateIndexHtml(entries: ListingEntry[]): string {
  const needs = entries.filter((e) => !e.status.hasWebsite);
  const has = entries.filter((e) => e.status.hasWebsite);

  const card = (e: ListingEntry): string => {
    const p = paletteFor(e.business);
    const b = e.business;
    const links = [
      e.sitePath && `<a class="pill" href="${esc(e.sitePath)}">Open site</a>`,
      e.videoPath && `<a class="pill ghost" href="${esc(e.videoPath)}">Promo video</a>`,
      e.status.hasWebsite &&
        e.status.url &&
        `<a class="pill ghost" href="${esc(e.status.url)}" target="_blank" rel="noopener">Existing site ↗</a>`,
    ]
      .filter(Boolean)
      .join(" ");
    return `<article class="card">
      <div class="ava" style="background:linear-gradient(135deg, ${p.accent}, ${p.accentDeep})">${esc(initials(b.name))}</div>
      <div class="body">
        <h3>${esc(b.name)}</h3>
        <div class="meta">${[esc(b.category ?? ""), esc(b.address ?? "")].filter(Boolean).join(" · ")}</div>
        <div class="tags">
          ${b.rating !== undefined ? `<span class="tag">${stars(b.rating)} ${b.rating.toFixed(1)}</span>` : ""}
          <span class="tag">${b.reviews.length} review${b.reviews.length === 1 ? "" : "s"}</span>
          <span class="tag">${b.images.length} photo${b.images.length === 1 ? "" : "s"}</span>
          <span class="tag ${e.status.hasWebsite ? "ok" : "warn"}">${e.status.hasWebsite ? "has website" : "needs website"}</span>
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
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Business Directory — ${entries.length} listings</title>
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
      .links { display: flex; gap: 8px; flex-wrap: wrap; }
      .pill { font-size: 13px; font-weight: 600; text-decoration: none; padding: 8px 14px; border-radius: 999px; background: #4f7cff; color: #fff; }
      .pill.ghost { background: transparent; border: 1px solid #384056; color: #cdd6f4; }
      .muted { opacity: .4; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <h1>Business Directory</h1>
        <p>Scraped and listed ${entries.length} businesses. Sites and promo videos were auto-built for those without one.</p>
      </header>
      <div class="stats">
        <div class="stat"><b>${entries.length}</b><span>businesses listed</span></div>
        <div class="stat"><b>${needs.length}</b><span>needed a website</span></div>
        <div class="stat"><b>${has.length}</b><span>already had one</span></div>
      </div>
      ${section("Websites built for these businesses", needs)}
      ${section("Already have a website", has)}
    </div>
  </body>
</html>
`;
}
