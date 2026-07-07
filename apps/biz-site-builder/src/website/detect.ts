import type { Business, WebsiteStatus } from "../types.ts";
import { detectTechStack } from "./techstack.ts";

/**
 * Hosts that are a social/marketplace presence, NOT a business's own website.
 * A business whose only "website" is a Facebook page still needs a real site.
 */
const NON_WEBSITE_HOSTS = [
  "facebook.com",
  "m.facebook.com",
  "fb.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "linkedin.com",
  "yelp.com",
  "tripadvisor.com",
  "google.com",
  "goo.gl",
  "maps.app.goo.gl",
  "linktr.ee",
  "wa.me",
  "t.me",
  "youtube.com",
  "pinterest.com",
];

export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function isOwnWebsite(url: string): boolean {
  const normalized = normalizeUrl(url);
  if (!normalized) return false;
  const host = new URL(normalized).hostname.replace(/^www\./, "").toLowerCase();
  return !NON_WEBSITE_HOSTS.includes(host);
}

/**
 * Decide whether a business already has its own website. Pure/synchronous — no
 * network. Use {@link verifyLive} separately when you also want to catch dead
 * links.
 */
export function detectWebsite(business: Business): WebsiteStatus {
  const raw = business.website?.trim();
  if (!raw) {
    return { hasWebsite: false, reason: "no website listed" };
  }
  const normalized = normalizeUrl(raw);
  if (!normalized) {
    return { hasWebsite: false, url: raw, reason: "listed website is not a valid URL" };
  }
  if (!isOwnWebsite(normalized)) {
    return {
      hasWebsite: false,
      url: normalized,
      reason: "only a social/marketplace profile, not an owned site",
    };
  }
  return { hasWebsite: true, url: normalized, reason: "has an owned website" };
}

/**
 * Optionally confirm a site actually responds. Returns a refined status where
 * `live === false` flips `hasWebsite` to false so a business with a dead link
 * still gets a site built. Network failures are treated as "unknown" (we don't
 * penalise a business for a transient error) unless `strict` is set.
 */
export async function verifyLive(
  status: WebsiteStatus,
  opts: { timeoutMs?: number; strict?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<WebsiteStatus> {
  if (!status.hasWebsite || !status.url) return status;
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    const res = await doFetch(status.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    const live = res.status < 400;
    if (live) {
      // Detect what the existing site is built on (weak DIY builder → still a lead).
      let tech: ReturnType<typeof detectTechStack> | undefined;
      try {
        tech = detectTechStack(await res.text(), res.headers);
      } catch {
        tech = undefined;
      }
      const enriched: WebsiteStatus = { ...status, live: true };
      if (tech?.platform) enriched.platform = tech.platform;
      if (tech && tech.technologies.length) enriched.technologies = tech.technologies;
      if (tech?.weakBuilder) enriched.weakBuilder = true;
      if (tech?.outdated) enriched.outdated = true;
      return enriched;
    }
    return {
      hasWebsite: false,
      url: status.url,
      live: false,
      reason: `listed website returned HTTP ${res.status}`,
    };
  } catch {
    if (opts.strict) {
      return {
        hasWebsite: false,
        url: status.url,
        live: false,
        reason: "listed website is unreachable",
      };
    }
    return {
      ...status,
      live: undefined,
      reason: `${status.reason} (liveness unchecked: request failed)`,
    };
  } finally {
    clearTimeout(timer);
  }
}
