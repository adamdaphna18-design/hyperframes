import { makePatch } from "../../patch-factory.js";
import type { FailureCluster, Harness, HarnessPatch, Proposer, SuiteResult } from "../../types.js";
import { GOVERNANCE_RULE } from "./catalog.js";

/**
 * Maps recurring governance breaches to minimal harness rules. Most fixes are a
 * single declarative rule. The trade-against-regime cluster offers an over-broad
 * candidate FIRST — a hard `maxToolCalls: 1` throttle ("halt all trading"), which
 * would starve the confirmation-heavy HEALTHY trades that must cross-check
 * structure / entry / discipline / regime / rug — so the regression gate has a
 * real over-reach to reject before it accepts the sound `veto-trades-against-regime`
 * rule. Risk edits are still edits: the gate rejects a rule that blocks a
 * legitimate trade, however prudent it sounds.
 */
export class FinfinHeuristicProposer implements Proposer {
  // Dispatched through the Proposer interface by the loop.
  // fallow-ignore-next-line unused-class-member
  async propose(
    _harness: Harness,
    cluster: FailureCluster,
    _suite: SuiteResult,
  ): Promise<HarnessPatch[]> {
    if (cluster.pattern === "trade-against-regime") {
      return [
        makePatch(
          "finfin-patch",
          "trade-against-regime",
          "Halt all trading to stop fighting the tape.",
          [{ op: "setLimit", key: "maxToolCalls", value: 1 }],
        ),
        makePatch(
          "finfin-patch",
          "trade-against-regime",
          `Adopt the "${GOVERNANCE_RULE["trade-against-regime"]}" rule.`,
          [{ op: "addRule", text: GOVERNANCE_RULE["trade-against-regime"] }],
        ),
      ];
    }
    const rule = RULE_FOR_CLUSTER[cluster.pattern];
    if (!rule) return [];
    return [
      makePatch("finfin-patch", cluster.pattern, `Adopt the "${rule}" governance rule.`, [
        { op: "addRule", text: rule },
      ]),
    ];
  }
}

const RULE_FOR_CLUSTER: Record<string, string | undefined> = {
  "oversized-position": GOVERNANCE_RULE["oversized-position"],
  "chased-extended-entry": GOVERNANCE_RULE["chased-extended-entry"],
  "unverified-rug": GOVERNANCE_RULE["unverified-rug"],
  "pairs-on-returns": GOVERNANCE_RULE["pairs-on-returns"],
};
