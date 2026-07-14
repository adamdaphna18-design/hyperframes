import { makePatch } from "../../patch-factory.js";
import type { FailureCluster, Harness, HarnessPatch, Proposer, SuiteResult } from "../../types.js";
import { PATHOLOGY_RULE } from "./projects.js";

/**
 * Maps recurring data-science failure clusters to minimal harness edits. Most
 * fixes are a single best-practice rule. The runaway-training cluster offers an
 * over-aggressive candidate first — clamping the compute budget, which would
 * starve the heavy deep-learning projects — so the regression gate has a real
 * candidate to reject before it accepts the sound `use-early-stopping` rule.
 */
export class DsHeuristicProposer implements Proposer {
  // Dispatched through the Proposer interface by the loop.
  async propose(
    _harness: Harness,
    cluster: FailureCluster,
    _suite: SuiteResult,
  ): Promise<HarnessPatch[]> {
    if (cluster.pattern === "runaway-training") {
      return [
        makePatch(
          "ds-patch",
          "runaway-training",
          "Clamp the compute budget to stop long training.",
          [{ op: "setLimit", key: "maxToolCalls", value: 3 }],
        ),
        makePatch("ds-patch", "runaway-training", "Add early stopping to bound training.", [
          { op: "addRule", text: PATHOLOGY_RULE["runaway-training"] },
        ]),
      ];
    }
    const rule = RULE_FOR_CLUSTER[cluster.pattern];
    if (!rule) return [];
    return [
      makePatch("ds-patch", cluster.pattern, `Adopt the "${rule}" practice.`, [
        { op: "addRule", text: rule },
      ]),
    ];
  }
}

const RULE_FOR_CLUSTER: Record<string, string | undefined> = {
  "data-leakage": PATHOLOGY_RULE["data-leakage"],
  "non-determinism": PATHOLOGY_RULE["non-determinism"],
  "unhandled-nan": PATHOLOGY_RULE["unhandled-nan"],
  "class-imbalance": PATHOLOGY_RULE["class-imbalance"],
};
