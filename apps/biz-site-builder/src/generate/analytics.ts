import type { Business } from "../types.ts";
import { jsStr } from "./util.ts";
import { cityOf } from "./meta.ts";

/**
 * Optional analytics snippets, injected only when a provider is configured.
 * Google Analytics 4 (gtag.js) fires a `view_item` event tagged with the
 * business name / category / city; Plausible (self-hostable, cookieless) is a
 * privacy-friendly alternative. Both are plain templating — no build-time calls.
 */
export interface AnalyticsOptions {
  /** GA4 measurement id, e.g. G-XXXXXXX. */
  ga4?: string;
  /** Plausible site domain, e.g. example.com. */
  plausible?: string;
  /** Plausible script host (self-hosted installs). */
  plausibleHost?: string;
}

export function hasAnalytics(opts: AnalyticsOptions): boolean {
  return Boolean(opts.ga4 || opts.plausible);
}

/** Analytics `<script>` tags for a business page, or "" when unconfigured. */
export function analyticsSnippet(business: Business, opts: AnalyticsOptions): string {
  const out: string[] = [];
  if (opts.ga4) {
    const id = opts.ga4;
    const city = cityOf(business) ?? "";
    out.push(
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}"></script>`,
      `<script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${jsStr(id)}');
      gtag('event', 'view_item', {
        business_name: '${jsStr(business.name)}',
        item_category: '${jsStr(business.category ?? "")}',
        city: '${jsStr(city)}'
      });
    </script>`,
    );
  }
  if (opts.plausible) {
    const host = (opts.plausibleHost ?? "https://plausible.io").replace(/\/+$/, "");
    out.push(
      `<script defer data-domain="${jsStr(opts.plausible)}" src="${host}/js/script.js"></script>`,
    );
  }
  return out.join("\n    ");
}
