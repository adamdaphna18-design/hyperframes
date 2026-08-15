import { makePatch } from "../../patch-factory.js";
import type { FailureCluster, Harness, HarnessPatch, Proposer, SuiteResult } from "../../types.js";
import { HARMFUL_RULE, RULE_FOR_PATTERN } from "./scenarios.js";

/**
 * Proposes the indicator rule each mis-read pattern needs. For the momentum
 * (macd-bullish) cluster it offers an over-aggressive candidate first — pairing
 * the sound MACD rule with a `chase-momentum` rule that buys on any positive
 * momentum. That lifts the momentum setups but **buys the overbought ones too**,
 * so the regression gate rejects it before accepting the clean MACD confirmation.
 * Fitting a rule to one setup by breaking another is disqualified.
 */
export class TaProposer implements Proposer {
  // Dispatched through the Proposer interface by the loop.
  async propose(
    _harness: Harness,
    cluster: FailureCluster,
    _suite: SuiteResult,
  ): Promise<HarnessPatch[]> {
    const pattern = cluster.pattern as keyof typeof RULE_FOR_PATTERN;
    const rule = RULE_FOR_PATTERN[pattern];
    if (!rule) return [];

    if (pattern === "macd-bullish") {
      return [
        makePatch("ta-patch", "macd-bullish", "Confirm with MACD and chase every positive move.", [
          { op: "addRule", text: rule },
          { op: "addRule", text: HARMFUL_RULE },
        ]),
        makePatch("ta-patch", "macd-bullish", "Require MACD confirmation for momentum entries.", [
          { op: "addRule", text: rule },
        ]),
      ];
    }
    return [
      makePatch("ta-patch", pattern, `Adopt the "${rule}" indicator rule.`, [
        { op: "addRule", text: rule },
      ]),
    ];
  }
}
