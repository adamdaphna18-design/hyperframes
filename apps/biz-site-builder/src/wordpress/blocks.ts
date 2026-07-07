import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";
import { bestReview, esc, stars, taglineFor } from "../generate/util.ts";

/**
 * Gutenberg block markup builders. The same markup seeds the WordPress WXR
 * import (page bodies) and the block theme's front-page template, so a business
 * looks identical whether the site is populated by import or by the theme.
 */

export function heading(text: string, level = 2): string {
  return `<!-- wp:heading {"level":${level}} --><h${level} class="wp-block-heading">${esc(text)}</h${level}><!-- /wp:heading -->`;
}

export function paragraph(text: string): string {
  return `<!-- wp:paragraph --><p>${esc(text)}</p><!-- /wp:paragraph -->`;
}

export function button(label: string, href: string): string {
  return `<!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="${esc(href)}">${esc(label)}</a></div><!-- /wp:button -->`;
}

function buttons(items: Array<{ label: string; href: string }>): string {
  if (!items.length) return "";
  return `<!-- wp:buttons -->\n<div class="wp-block-buttons">${items
    .map((b) => button(b.label, b.href))
    .join("")}</div>\n<!-- /wp:buttons -->`;
}

export function heroBlock(business: Business, s: Strings): string {
  const tagline = taglineFor(business, s);
  const img = business.images[0];
  const inner = `<!-- wp:heading {"level":1,"textColor":"white"} --><h1 class="wp-block-heading has-white-color has-text-color">${esc(business.name)}</h1><!-- /wp:heading -->
<!-- wp:paragraph {"textColor":"white"} --><p class="has-white-color has-text-color">${esc(tagline)}</p><!-- /wp:paragraph -->
${buttons(
  [
    business.phone
      ? { label: s.callUs, href: `tel:${business.phone.replace(/[^+\d]/g, "")}` }
      : null,
    business.address
      ? {
          label: s.getDirections,
          href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address)}`,
        }
      : null,
  ].filter((x): x is { label: string; href: string } => x !== null),
)}`;

  if (img) {
    return `<!-- wp:cover {"url":"${esc(img)}","dimRatio":55,"minHeight":70,"minHeightUnit":"vh","align":"full"} -->
<div class="wp-block-cover alignfull" style="min-height:70vh"><span aria-hidden="true" class="wp-block-cover__background has-background-dim-60 has-background-dim"></span><img class="wp-block-cover__image-background" src="${esc(img)}" data-object-fit="cover"/><div class="wp-block-cover__inner-container">${inner}</div></div>
<!-- /wp:cover -->`;
  }
  return `<!-- wp:group {"align":"full","backgroundColor":"accent","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignfull has-accent-background-color has-background">${inner}</div>
<!-- /wp:group -->`;
}

export function galleryBlock(business: Business): string {
  if (business.images.length < 1) return "";
  const figures = business.images
    .slice(0, 8)
    .map(
      (src) =>
        `<!-- wp:image --><figure class="wp-block-image"><img src="${esc(src)}" alt="${esc(business.name)}"/></figure><!-- /wp:image -->`,
    )
    .join("");
  return `<!-- wp:gallery {"columns":3,"linkTo":"none"} -->
<figure class="wp-block-gallery has-nested-images columns-3 is-cropped">${figures}</figure>
<!-- /wp:gallery -->`;
}

export function reviewBlock(r: { text: string; author?: string; rating?: number }): string {
  const citation = [r.author ? esc(r.author) : "", r.rating !== undefined ? stars(r.rating) : ""]
    .filter(Boolean)
    .join(" · ");
  return `<!-- wp:quote --><blockquote class="wp-block-quote"><!-- wp:paragraph --><p>${esc(r.text)}</p><!-- /wp:paragraph -->${
    citation ? `<cite>${citation}</cite>` : ""
  }</blockquote><!-- /wp:quote -->`;
}

export function reviewsBlock(business: Business, s: Strings, limit = 6): string {
  if (!business.reviews.length) return "";
  return `${heading(s.whatPeopleSay)}\n${business.reviews.slice(0, limit).map(reviewBlock).join("\n")}`;
}

export function contactBlock(business: Business, s: Strings): string {
  const rows = [
    business.address && `<strong>${esc(s.addressLabel)}:</strong> ${esc(business.address)}`,
    business.phone && `<strong>${esc(s.phoneLabel)}:</strong> ${esc(business.phone)}`,
    business.email && `<strong>${esc(s.emailLabel)}:</strong> ${esc(business.email)}`,
    business.hours && `<strong>${esc(s.hoursLabel)}:</strong> ${esc(business.hours)}`,
  ].filter(Boolean);
  const list = rows.length
    ? `<!-- wp:list -->\n<ul class="wp-block-list">${rows.map((r) => `<!-- wp:list-item --><li>${r}</li><!-- /wp:list-item -->`).join("")}</ul>\n<!-- /wp:list -->`
    : paragraph(s.contactFallback);
  // OSM/Leaflet map via the theme's [bsb_map] shortcode (see functions.php).
  const map = business.location
    ? `\n<!-- wp:shortcode -->[bsb_map lat="${business.location.lat}" lon="${business.location.lon}" label="${esc(business.name)}"]<!-- /wp:shortcode -->`
    : "";
  return `${heading(s.visitHeading(business.name))}\n${list}${map}`;
}

/** Full block body for the Home page. */
export function homePage(business: Business, s: Strings): string {
  const parts = [heroBlock(business, s)];
  if (business.description) parts.push(heading(s.about), paragraph(business.description));
  const gallery = galleryBlock(business);
  if (gallery) parts.push(gallery);
  const featured = bestReview(business);
  if (featured) parts.push(heading(s.whatPeopleSay), reviewBlock(featured));
  parts.push(contactBlock(business, s));
  return parts.join("\n\n");
}

export function aboutPage(business: Business, s: Strings): string {
  const parts = [heading(s.about, 1)];
  if (business.description) parts.push(paragraph(business.description));
  else parts.push(paragraph(taglineFor(business, s)));
  const gallery = galleryBlock(business);
  if (gallery) parts.push(gallery);
  return parts.join("\n\n");
}

export function reviewsPage(business: Business, s: Strings): string {
  return [
    heading(s.whatPeopleSay, 1),
    business.reviews.map(reviewBlock).join("\n") || paragraph(s.contactFallback),
  ].join("\n\n");
}

export function contactPage(business: Business, s: Strings): string {
  return contactBlock(business, s);
}
