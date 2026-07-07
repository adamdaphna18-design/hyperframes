import type { Strings } from "../i18n/strings.ts";
import { stringsFor } from "../i18n/strings.ts";
import type { IndustryProfile } from "./industry.ts";

/**
 * A deterministic **ROI estimate** for a recommended recurring package. It is
 * pure arithmetic over inputs the *operator supplies* — how many leads/month the
 * business gets (or misses) — combined with the industry-average deal size and
 * close rate from the profile. It never invents a lead volume: no `leadsPerMonth`
 * input, no estimate. Every figure it returns is transparently a function of the
 * stated assumptions, which are echoed back in `assumptionsNote` so the number is
 * never presented as a measurement of the specific business.
 */

export interface RoiInputs {
  /** Operator-supplied: leads/month the business gets or is missing. Required. */
  leadsPerMonth: number;
  /** Monthly price of the package being pitched (ILS). */
  monthlyPackagePrice: number;
  /** Override the industry-average deal size. */
  dealSize?: number;
  /** Override the industry-average close rate (0–1). */
  conversionRate?: number;
  /** Fraction of the leads the package is assumed to capture (0–1). Default 0.7. */
  captureRate?: number;
}

export interface RoiEstimate {
  dealSize: number;
  conversionRate: number;
  captureRate: number;
  leadsPerMonth: number;
  leadsRecovered: number;
  revenueRecovered: number;
  packagePrice: number;
  netMonthlyGain: number;
  roiPercent: number;
  /** Leads/month needed to cover the package cost. */
  breakEvenLeads: number;
  currency: string;
  /** A one-line statement of the assumptions the numbers rest on. */
  assumptionsNote: string;
}

export function estimateRoi(
  profile: IndustryProfile,
  inputs: RoiInputs,
  s: Strings = stringsFor("en"),
): RoiEstimate {
  const he = s.code === "he";
  const dealSize = inputs.dealSize ?? profile.avgDealSize;
  const conversionRate = inputs.conversionRate ?? profile.conversionRate;
  const captureRate = inputs.captureRate ?? 0.7;
  const leadsPerMonth = Math.max(0, inputs.leadsPerMonth);
  const packagePrice = inputs.monthlyPackagePrice;

  const leadsRecovered = leadsPerMonth * captureRate;
  const revenueRecovered = Math.round(leadsRecovered * dealSize * conversionRate);
  const netMonthlyGain = revenueRecovered - packagePrice;
  const roiPercent = packagePrice > 0 ? Math.round((netMonthlyGain / packagePrice) * 100) : 0;
  const perDeal = dealSize * conversionRate;
  const breakEvenLeads = perDeal > 0 ? Math.round((packagePrice / perDeal) * 10) / 10 : 0;

  const pct = Math.round(conversionRate * 100);
  const assumptionsNote = he
    ? `הערכה על בסיס עסקה ממוצעת בענף של ₪${dealSize.toLocaleString("en-US")}, ${pct}% סגירה, וקלט של ${leadsPerMonth} לידים בחודש. אלו ממוצעים ענפיים, לא מדידה של העסק.`
    : `Estimate based on an industry-average ${"₪"}${dealSize.toLocaleString("en-US")} deal, a ${pct}% close rate, and your input of ${leadsPerMonth} leads/month. These are industry averages, not a measurement of this business.`;

  return {
    dealSize,
    conversionRate,
    captureRate,
    leadsPerMonth,
    leadsRecovered: Math.round(leadsRecovered * 10) / 10,
    revenueRecovered,
    packagePrice,
    netMonthlyGain,
    roiPercent,
    breakEvenLeads,
    currency: "₪",
    assumptionsNote,
  };
}
