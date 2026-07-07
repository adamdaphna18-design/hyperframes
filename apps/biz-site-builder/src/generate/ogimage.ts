import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";
import { stringsFor } from "../i18n/strings.ts";
import { initials, outputSlug, paletteFor, stars, taglineFor } from "./util.ts";
import { xmlEsc } from "../wordpress/xml.ts";

/**
 * A dynamic, branded Open Graph share card (1200×630) rendered as a
 * deterministic, self-contained SVG — no headless browser needed at build time.
 * Overlays the business name, category and a star badge on a gradient derived
 * from the brand colour, turning social shares into rich previews.
 *
 * SVG is used directly as `og:image` (works in modern crawlers). For maximum
 * legacy compatibility it can be rasterised to PNG offline (see README).
 */

const WIDTH = 1200;
const HEIGHT = 630;

/** Break a title into up to `maxLines` lines of ~`perLine` chars, word-aware. */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > perLine && line) {
      lines.push(line.trim());
      line = w;
      if (lines.length === maxLines - 1) break;
    } else {
      line = `${line} ${w}`.trim();
    }
  }
  if (line && lines.length < maxLines) lines.push(line.trim());
  const joined = lines.join(" ").length;
  if (joined < text.length && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1]!.replace(/…?$/, "…");
  }
  return lines;
}

export function ogImageSvg(business: Business, s: Strings = stringsFor("en")): string {
  const p = paletteFor(business);
  const nameLines = wrap(business.name, 22, 2);
  const nameFont = nameLines.length > 1 || business.name.length > 16 ? 84 : 104;
  const category = business.category ?? taglineFor(business, s);
  const rtl = s.dir === "rtl";
  const anchor = rtl ? "end" : "start";
  const x = rtl ? WIDTH - 90 : 90;
  const badgeX = rtl ? WIDTH - 90 - 150 : 90;

  const nameTspans = nameLines
    .map((ln, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : nameFont + 8}">${xmlEsc(ln)}</tspan>`)
    .join("");

  const ratingBadge =
    business.rating !== undefined
      ? `<text x="${x}" y="500" font-size="40" fill="#ffffff" opacity="0.95" text-anchor="${anchor}">${xmlEsc(stars(business.rating))} ${business.rating.toFixed(1)}</text>`
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.accent}"/>
      <stop offset="1" stop-color="${p.accentDeep}"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#0a0a0f" opacity="0.18"/>
  <g font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">
    <rect x="${badgeX}" y="90" width="150" height="150" rx="34" fill="#ffffff" opacity="0.16" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2"/>
    <text x="${badgeX + 75}" y="188" font-size="72" font-weight="800" fill="#ffffff" text-anchor="middle">${xmlEsc(initials(business.name))}</text>
    <text y="340" font-size="${nameFont}" font-weight="800" fill="#ffffff" text-anchor="${anchor}">${nameTspans}</text>
    <text x="${x}" y="440" font-size="44" fill="#ffffff" opacity="0.92" text-anchor="${anchor}">${xmlEsc(category)}</text>
    ${ratingBadge}
  </g>
</svg>
`;
}

/** File name for a business's OG image within the sites/ directory. */
export function ogImageFilename(business: Business): string {
  return `${outputSlug(business)}.og.svg`;
}
