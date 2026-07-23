/**
 * Lightweight tech-stack / platform detection (WhatWeb / webanalyze /
 * site-platform-detector style) from a page's HTML + response headers. Signature
 * based and dependency-free. Used on the "has a website" branch to record what a
 * business's existing site is built on — which sharpens lead scoring, since a
 * business on a **DIY builder** (Wix, Squarespace, GoDaddy…) is a weak online
 * presence and still a lead.
 */

export interface TechStack {
  /** Best-guess primary platform / CMS, if identified. */
  platform?: string;
  /** All matched technologies (CMS, frameworks, analytics, servers). */
  technologies: string[];
  /** True when the platform is a locked-in DIY site builder. */
  weakBuilder: boolean;
  /** True when the site runs visibly outdated tech → a redesign lead. */
  outdated: boolean;
  /** The specific outdated signals matched (jQuery 1.x, Flash, …). */
  outdatedSignals: string[];
}

interface Signature {
  name: string;
  /** True if this is a primary platform (vs. an auxiliary library). */
  platform?: boolean;
  weakBuilder?: boolean;
  /** Marks a legacy/outdated technology (a redesign opportunity). */
  outdated?: boolean;
  html?: RegExp;
  header?: { name: string; value?: RegExp };
}

// Legacy / end-of-life signatures: a live site matching these is a redesign lead.
const OUTDATED_SIGNATURES: Signature[] = [
  { name: "jQuery 1.x", outdated: true, html: /jquery[-/.]1\.\d|jquery\.min\.js\?ver=1\./i },
  { name: "jQuery 2.x", outdated: true, html: /jquery[-/.]2\.\d/i },
  {
    name: "Bootstrap 3",
    outdated: true,
    html: /bootstrap[-/.]3\.\d|bootstrap\.min\.(?:css|js)\?ver=3\./i,
  },
  {
    name: "Adobe Flash",
    outdated: true,
    html: /swfobject|\.swf["'?]|application\/x-shockwave-flash/i,
  },
  { name: "AngularJS (v1)", outdated: true, html: /angular(?:\.min)?\.js|ng-app=|ng-controller=/i },
  { name: "ASP.NET WebForms", outdated: true, html: /__VIEWSTATE|__EVENTVALIDATION/i },
  { name: "Frames / table layout", outdated: true, html: /<frameset|<frame\s|<font\b/i },
];

// Order matters: earlier platform matches win as the "primary" platform.
const SIGNATURES: Signature[] = [
  {
    name: "WordPress",
    platform: true,
    html: /wp-content\/|wp-includes\/|\/wp-json|name=["']generator["'][^>]*WordPress/i,
    header: { name: "link", value: /wp-json/i },
  },
  {
    name: "Wix",
    platform: true,
    weakBuilder: true,
    html: /static\.wixstatic\.com|X-Wix|wix\.com|_wixCssStates/i,
    header: { name: "x-wix-request-id" },
  },
  {
    name: "Squarespace",
    platform: true,
    weakBuilder: true,
    html: /static1\.squarespace\.com|squarespace\.com|Static\.SQUARESPACE_CONTEXT/i,
    header: { name: "server", value: /Squarespace/i },
  },
  {
    name: "Shopify",
    platform: true,
    html: /cdn\.shopify\.com|Shopify\.theme|shopify\.com/i,
    header: { name: "x-shopify-stage" },
  },
  {
    name: "Webflow",
    platform: true,
    weakBuilder: true,
    html: /assets\.website-files\.com|assets-global\.website-files\.com|data-wf-page|generator["'][^>]*Webflow/i,
  },
  {
    name: "GoDaddy Website Builder",
    platform: true,
    weakBuilder: true,
    html: /img1\.wsimg\.com|godaddy|website-builder/i,
  },
  {
    name: "Weebly",
    platform: true,
    weakBuilder: true,
    html: /weebly\.com|cdn\d?\.editmysite\.com/i,
  },
  {
    name: "Joomla",
    platform: true,
    html: /Joomla!|\/media\/jui\/|com_content/i,
    header: { name: "x-content-encoded-by", value: /Joomla/i },
  },
  {
    name: "Drupal",
    platform: true,
    html: /Drupal\.settings|sites\/all\/|drupal\.js/i,
    header: { name: "x-generator", value: /Drupal/i },
  },
  { name: "Ghost", platform: true, html: /ghost\.io|content=["']Ghost/i },
  // Auxiliary technologies (not a primary platform).
  { name: "WooCommerce", html: /woocommerce/i },
  { name: "Elementor", html: /elementor/i },
  { name: "jQuery", html: /jquery(?:\.min)?\.js/i },
  { name: "React", html: /react(?:-dom)?(?:\.production)?\.min\.js|data-reactroot/i },
  { name: "Vue.js", html: /vue(?:\.min)?\.js|data-v-[0-9a-f]{8}/i },
  { name: "Bootstrap", html: /bootstrap(?:\.min)?\.(?:css|js)/i },
  { name: "Google Tag Manager", html: /googletagmanager\.com/i },
  { name: "Google Analytics", html: /google-analytics\.com|gtag\/js/i },
  { name: "Cloudflare", header: { name: "server", value: /cloudflare/i } },
];

function headerGet(
  headers: Headers | Record<string, string> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === lower) return v;
  return undefined;
}

export function detectTechStack(
  html: string,
  headers?: Headers | Record<string, string>,
): TechStack {
  const technologies: string[] = [];
  const outdatedSignals: string[] = [];
  let platform: string | undefined;
  let weakBuilder = false;

  const test = (sig: Signature): boolean => {
    if (sig.html && sig.html.test(html)) return true;
    if (sig.header) {
      const value = headerGet(headers, sig.header.name);
      if (value !== undefined && (!sig.header.value || sig.header.value.test(value))) return true;
    }
    return false;
  };

  for (const sig of SIGNATURES) {
    if (!test(sig)) continue;
    technologies.push(sig.name);
    if (sig.platform && !platform) {
      platform = sig.name;
      weakBuilder = Boolean(sig.weakBuilder);
    }
  }

  for (const sig of OUTDATED_SIGNATURES) {
    if (test(sig)) outdatedSignals.push(sig.name);
  }

  // Server banner as a fallback technology.
  const server = headerGet(headers, "server");
  if (server && !technologies.includes(server)) {
    const banner = server.split("/")[0]!.trim();
    if (/nginx|apache|litespeed|iis|caddy/i.test(banner)) technologies.push(banner);
  }

  return {
    platform,
    technologies,
    weakBuilder,
    outdated: outdatedSignals.length > 0,
    outdatedSignals,
  };
}
