import { makePatch } from "../../patch-factory.js";
import type { FailureCluster, Harness, HarnessPatch, Proposer, SuiteResult } from "../../types.js";
import { COST_CUT_RULE, MIN_TIER_FOR_CLASS, routeRule, type RequestClass } from "./tiers.js";

/**
 * For each under-served request class the loop clusters, proposes the minimal
 * routing rule: send that class to its cheapest viable tier. For the busiest
 * cluster (code) it offers an over-aggressive candidate first — pair the sound
 * route with a `force-cheapest-tier` rule that slams *everything* onto the cheapest
 * tier to "cut the bill." That does cut cost, but it under-serves the classes
 * already routed correctly, so the regression gate rejects it before accepting the
 * clean per-class route. Cutting cost by breaking quality is disqualified.
 */
export class CostProposer implements Proposer {
  // Dispatched through the Proposer interface by the loop.
  async propose(
    _harness: Harness,
    cluster: FailureCluster,
    _suite: SuiteResult,
  ): Promise<HarnessPatch[]> {
    const cls = cluster.pattern as RequestClass;
    const tier = MIN_TIER_FOR_CLASS[cls];
    if (!tier) return [];
    const route = routeRule(cls, tier);

    if (cls === "code") {
      return [
        makePatch(
          "cost-patch",
          cls,
          "Route code to sonnet and cap the whole bill at the cheapest tier.",
          [
            { op: "addRule", text: route },
            { op: "addRule", text: COST_CUT_RULE },
          ],
        ),
        makePatch("cost-patch", cls, `Route ${cls} requests to the ${tier} tier.`, [
          { op: "addRule", text: route },
        ]),
      ];
    }
    return [
      makePatch("cost-patch", cls, `Route ${cls} requests to the ${tier} tier.`, [
        { op: "addRule", text: route },
      ]),
    ];
  }
}
