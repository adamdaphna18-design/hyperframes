import type { Strings } from "../i18n/strings.ts";
import { stringsFor } from "../i18n/strings.ts";
import type { AuditReport } from "./audit.ts";

/**
 * The **arbitrage layer** — a deterministic prospect-prioritization scorer.
 *
 * The whole acquisition engine is a spatial arbitrage: a business in a lucrative
 * trade with a broken or absent website is *underpriced online* — worth far more
 * in leads than the presence it currently captures. You buy that gap cheaply
 * (build the site) and the owner realizes the fair value. The spread is the
 * margin, and — like any arbitrage — it is fleeting: the wide-open prospect today
 * is picked up by a competitor agency tomorrow.
 *
 * A naive "worst score first" ranking mixes up a broken restaurant (₪22/deal)
 * with a broken law firm (₪600/deal). This layer ranks by the actual spread:
 *
 *     spread = value × gap × (1 − friction)
 *
 *   value    — industry economics: expected revenue per captured lead
 *              (avg deal size × close rate), both already in the app as
 *              clearly-labelled industry averages. NOT a measurement of the
 *              specific business, and NOT presented as money — it is normalized
 *              into a 0..1 ticket factor for ranking only.
 *   gap      — how underpriced the current presence is: (100 − health score).
 *   friction — execution cost / contestedness: a site that already scores well
 *              is efficiently priced (little arbitrage); a weak/outdated builder
 *              signals a motivated switcher with low real lock-in (less friction).
 *
 * Deterministic (pure arithmetic over the audit report), EN + Hebrew. It invents
 * no lead volume and no currency figure — `spread` is an ordinal opportunity
 * index (0..100) for sorting a prospect list, nothing more.
 */

export interface ArbitrageScore {
  /** Ordinal opportunity index, 0..100 — for ranking a prospect list only. */
  spread: number;
  /** A = prime, B = worth pursuing, C = efficiently priced (thin spread). */
  grade: "A" | "B" | "C";
  /** Ticket factor, 0..1 — normalized industry economics. */
  value: number;
  /** Mispricing, 0..1 — how far the presence is below where it should be. */
  gap: number;
  /** Execution cost / contestedness, 0..1 — higher means harder to capture. */
  friction: number;
  /** Industry-average expected revenue per captured lead (ILS), for context. */
  dealValue: number;
  /** One-line, localized explanation of the ranking. */
  rationale: string;
}

/** Deal value (avg deal × close rate) at which the ticket factor saturates to 1. */
const VALUE_ANCHOR = 600;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Score a single prospect's arbitrage spread from its audit report. */
export function arbitrageScore(report: AuditReport, s: Strings = stringsFor("en")): ArbitrageScore {
  const he = s.code === "he";
  const dealValue = Math.round(report.industry.avgDealSize * report.industry.conversionRate);
  const value = clamp(dealValue / VALUE_ANCHOR, 0, 1);
  const gap = clamp((100 - report.score) / 100, 0, 1);

  // Friction: an already-healthy site is efficiently priced; a weak/outdated
  // builder is a motivated switcher with little real lock-in.
  let friction = 0.15;
  if (report.score >= 70) friction += 0.25;
  if (report.weakBuilder || report.outdated) friction -= 0.15;
  friction = clamp(friction, 0.05, 0.85);

  const spread = Math.round(value * gap * (1 - friction) * 100);
  const grade: ArbitrageScore["grade"] = spread >= 45 ? "A" : spread >= 22 ? "B" : "C";

  return {
    spread,
    grade,
    value,
    gap,
    friction,
    dealValue,
    rationale: rationaleFor(grade, value, gap, dealValue, he),
  };
}

function rationaleFor(
  grade: ArbitrageScore["grade"],
  value: number,
  gap: number,
  dealValue: number,
  he: boolean,
): string {
  const ticket =
    value >= 0.6
      ? he
        ? "עסקה בערך גבוה"
        : "high-value trade"
      : value >= 0.25
        ? he
          ? "עסקה בערך בינוני"
          : "mid-value trade"
        : he
          ? "עסקה בערך נמוך"
          : "low-value trade";
  const per = `₪${dealValue.toLocaleString("en-US")}`;
  if (grade === "A")
    return he
      ? `${ticket} (${per} לעסקה) עם פער נוכחות רחב — הזדמנות מובילה, חיכוך נמוך.`
      : `${ticket} (${per}/deal) with a wide presence gap — a prime, low-friction win.`;
  if (grade === "B")
    return he
      ? `${ticket} (${per} לעסקה) עם פער ממשי — שווה מרדף.`
      : `${ticket} (${per}/deal) with a real gap — worth pursuing.`;
  return gap < 0.2
    ? he
      ? `הנוכחות כבר מתומחרת ביעילות — פער דק, מרווח נמוך.`
      : `Presence is already efficiently priced — thin gap, low spread.`
    : he
      ? `${ticket} (${per} לעסקה) — הכלכלה מגבילה את המרווח.`
      : `${ticket} (${per}/deal) — the economics cap the spread.`;
}

/** Rank a batch of scored prospects by spread (widest first), score as a tiebreak. */
export function rankByArbitrage<T extends { arbitrage: ArbitrageScore; score: number }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => b.arbitrage.spread - a.arbitrage.spread || a.score - b.score);
}
