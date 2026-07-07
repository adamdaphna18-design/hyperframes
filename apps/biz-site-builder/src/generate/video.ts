import type { Business } from "../types.ts";
import {
  bestReview,
  esc,
  initials,
  jsStr,
  outputSlug,
  paletteFor,
  slugify,
  stars,
  taglineFor,
} from "./util.ts";

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js";

/**
 * Generate a hyperframes composition (HTML) — a short vertical-friendly promo
 * for the business. Renders to MP4 via `npx hyperframes render <file>` and can
 * be embedded with <hyperframes-player>.
 *
 * Conventions honoured (see hyperframes CLAUDE.md):
 *  - Root element carries data-composition-id / data-width / data-height /
 *    data-start / data-duration.
 *  - GSAP timeline is created paused and registered on window.__timelines.
 *  - Deterministic: no Date.now / Math.random / render-time fetches.
 */
export function generateVideo(
  business: Business,
  opts: { width?: number; height?: number } = {},
): string {
  const width = opts.width ?? 1080;
  const height = opts.height ?? 1920;
  const id = `promo-${slugify(business.name)}`;
  const p = paletteFor(business);
  const tagline = taglineFor(business);
  const review = bestReview(business);
  const hero = business.images[0];
  const duration = 9;

  const contactLine = business.phone ?? business.address ?? business.email ?? "Come visit us today";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${esc(business.name)} — promo</title>
    <script src="${GSAP_CDN}"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: #0a0a0f; }
      #stage {
        position: relative; width: ${width}px; height: ${height}px; overflow: hidden;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #fff;
        background: radial-gradient(130% 100% at 30% 15%, ${p.accent}, ${p.accentDeep} 70%, #0a0a0f);
      }
      .scene { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: 120px 90px; }
      .badge {
        width: 150px; height: 150px; border-radius: 34px; display: flex; align-items: center; justify-content: center;
        font-size: 62px; font-weight: 800; background: rgba(255,255,255,.16); border: 2px solid rgba(255,255,255,.35);
        margin-bottom: 40px;
      }
      .name { font-size: 96px; font-weight: 800; line-height: 1.02; letter-spacing: -0.02em; }
      .tagline { font-size: 46px; margin-top: 28px; max-width: 22ch; opacity: .95; font-weight: 500; }
      .rating { margin-top: 30px; font-size: 44px; letter-spacing: 4px; }
      .hero-img { position: absolute; inset: 0; background-size: cover; background-position: center; }
      .hero-img::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10,10,15,.25), rgba(10,10,15,.85)); }
      .quote { font-size: 58px; font-weight: 600; line-height: 1.2; }
      .quote .mark { font-size: 140px; line-height: .5; opacity: .5; display: block; margin-bottom: 20px; }
      .cite { font-size: 40px; margin-top: 36px; opacity: .8; font-weight: 500; }
      .cta-name { font-size: 78px; font-weight: 800; }
      .cta-line { font-size: 46px; margin-top: 26px; opacity: .95; }
      .cta-pill { margin-top: 46px; align-self: flex-start; padding: 26px 52px; border-radius: 999px; background: #fff; color: ${p.accentDeep}; font-weight: 800; font-size: 44px; }
    </style>
  </head>
  <body>
    <div
      id="stage"
      data-composition-id="${id}"
      data-width="${width}"
      data-height="${height}"
      data-start="0"
      data-duration="${duration}"
    >
      <div class="clip" data-start="0" data-duration="${duration}">
        <!-- Scene 1: brand reveal -->
        <div class="scene" data-scene="intro">
          <div class="badge">${esc(initials(business.name))}</div>
          <div class="name">${esc(business.name)}</div>
          <div class="tagline">${esc(tagline)}</div>
          ${business.rating !== undefined ? `<div class="rating">${stars(business.rating)} ${business.rating.toFixed(1)}</div>` : ""}
        </div>

        ${
          hero
            ? `<!-- Scene 2: hero image -->
        <div class="scene" data-scene="image" style="opacity:0">
          <div class="hero-img" style="background-image:url('${esc(hero)}')"></div>
          <div style="position:relative;margin-top:auto">
            <div class="name" style="font-size:72px">${esc(business.name)}</div>
          </div>
        </div>`
            : ""
        }

        ${
          review
            ? `<!-- Scene 3: review -->
        <div class="scene" data-scene="review" style="opacity:0">
          <div class="quote"><span class="mark">&ldquo;</span>${esc(truncate(review.text, 160))}</div>
          ${review.author ? `<div class="cite">— ${esc(review.author)}${review.rating !== undefined ? ` · ${stars(review.rating)}` : ""}</div>` : ""}
        </div>`
            : ""
        }

        <!-- Scene 4: CTA -->
        <div class="scene" data-scene="cta" style="opacity:0">
          <div class="cta-name">${esc(business.name)}</div>
          <div class="cta-line">${esc(contactLine)}</div>
          <div class="cta-pill">Visit us</div>
        </div>
      </div>
    </div>

    <script>
      (function () {
        var S = '[data-composition-id="${jsStr(id)}"] ';
        window.__timelines = window.__timelines || {};
        var tl = gsap.timeline({ paused: true });
        var q = function (sel) { return document.querySelector(S + sel); };

        // Scene 1 — brand reveal
        gsap.set(S + '.badge', { opacity: 0, scale: 0.7, y: 20 });
        gsap.set(S + '.name', { opacity: 0, y: 40 });
        gsap.set(S + '.tagline', { opacity: 0, y: 30 });
        gsap.set(S + '.rating', { opacity: 0 });
        tl.to(S + '.badge', { opacity: 1, scale: 1, y: 0, duration: 0.6, ease: 'back.out(1.6)' }, 0.1);
        tl.to(S + '.name', { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, 0.3);
        tl.to(S + '.tagline', { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' }, 0.6);
        tl.to(S + '.rating', { opacity: 1, duration: 0.5 }, 0.9);
        tl.to(S + '[data-scene="intro"]', { opacity: 0, duration: 0.5, ease: 'power1.in' }, 2.6);

        var t = 2.9;
        var img = q('[data-scene="image"]');
        if (img) {
          gsap.set(img, { opacity: 0 });
          gsap.set(S + '[data-scene="image"] .hero-img', { scale: 1.15 });
          tl.to(img, { opacity: 1, duration: 0.6 }, t);
          tl.to(S + '[data-scene="image"] .hero-img', { scale: 1, duration: 2.2, ease: 'none' }, t);
          tl.to(img, { opacity: 0, duration: 0.5 }, t + 2.0);
          t += 2.3;
        }

        var rev = q('[data-scene="review"]');
        if (rev) {
          gsap.set(rev, { opacity: 0 });
          gsap.set(S + '[data-scene="review"] .quote', { y: 30 });
          tl.to(rev, { opacity: 1, duration: 0.5 }, t);
          tl.to(S + '[data-scene="review"] .quote', { y: 0, duration: 0.7, ease: 'power2.out' }, t);
          tl.to(rev, { opacity: 0, duration: 0.5 }, t + 1.9);
          t += 2.3;
        }

        var cta = q('[data-scene="cta"]');
        gsap.set(cta, { opacity: 0 });
        gsap.set(S + '.cta-pill', { scale: 0.8, opacity: 0 });
        tl.to(cta, { opacity: 1, duration: 0.5 }, t);
        tl.to(S + '.cta-pill', { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(1.7)' }, t + 0.3);

        window.__timelines['${jsStr(id)}'] = tl;
      })();
    </script>
  </body>
</html>
`;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + "…";
}

export function videoSlug(business: Business): string {
  return outputSlug(business);
}
