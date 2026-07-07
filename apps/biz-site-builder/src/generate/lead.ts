import type { Business, WebsiteStatus } from "../types.ts";

/**
 * Deterministic lead score (0–100) for a scraped business — how promising a
 * website-build lead it is. Rewards an established business (rating, reviews),
 * reachability (phone/address) and opportunity (no owned site). Pure and
 * reproducible; no external scoring service.
 */
export function scoreLead(business: Business, status: WebsiteStatus): number {
  let score = 40;
  if (!status.hasWebsite) score += 30; // no owned site → the opportunity

  const rating = business.rating ?? 0;
  if (rating >= 4.5) score += 15;
  else if (rating >= 4) score += 8;

  const reviews = business.reviews.length;
  if (reviews > 100) score += 15;
  else if (reviews > 20) score += 8;
  else if (reviews > 0) score += 3;

  if (business.phone) score += 8;
  if (business.address) score += 4;

  return Math.max(0, Math.min(100, score));
}

export function leadTier(score: number): "hot" | "warm" | "cold" {
  if (score >= 80) return "hot";
  if (score >= 60) return "warm";
  return "cold";
}
