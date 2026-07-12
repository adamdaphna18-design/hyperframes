import { makePatch } from "../../patch-factory.js";
import type { FailureCluster, Harness, HarnessPatch, Proposer, SuiteResult } from "../../types.js";
import { MAXIMIZE_TAKE_RULE, SEGMENTS, priceRule, type SegmentId } from "./billing.js";

/**
 * For each churned segment the loop clusters, proposes the minimal pricing rule:
 * charge that segment right at the top of what it will happily pay (its fair share).
 * For the busiest cluster (startup) it offers an over-aggressive candidate first —
 * pair the fair startup price with a `maximize-take-rate` rule that grabs the greedy
 * take from *everyone* to "lift revenue." That does raise revenue-per-deal, but it
 * churns the accounts already retained, so the regression gate rejects it before
 * accepting the clean, segment-fair price. Revenue you can't keep is disqualified.
 */
export class PricingProposer implements Proposer {
  // Dispatched through the Proposer interface by the loop.
  // fallow-ignore-next-line unused-class-member
  async propose(
    _harness: Harness,
    cluster: FailureCluster,
    _suite: SuiteResult,
  ): Promise<HarnessPatch[]> {
    const seg = cluster.pattern as SegmentId;
    const segment = SEGMENTS[seg];
    if (!segment) return [];
    const rule = priceRule(seg, segment.fairShare);
    const pct = Math.round(segment.fairShare * 100);

    if (seg === "startup") {
      return [
        makePatch(
          "price-patch",
          seg,
          "Price startups fairly and grab the max take everywhere to lift revenue.",
          [
            { op: "addRule", text: rule },
            { op: "addRule", text: MAXIMIZE_TAKE_RULE },
          ],
        ),
        makePatch("price-patch", seg, `Price ${seg} at ${pct}% of savings.`, [
          { op: "addRule", text: rule },
        ]),
      ];
    }
    return [
      makePatch("price-patch", seg, `Price ${seg} at ${pct}% of savings.`, [
        { op: "addRule", text: rule },
      ]),
    ];
  }
}
