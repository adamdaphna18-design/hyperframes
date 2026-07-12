import { makePatch } from "../../patch-factory.js";
import type { FailureCluster, Harness, HarnessPatch, Proposer, SuiteResult } from "../../types.js";
import { GUARDRAIL_RULE, OVERBROAD_FREEZE_RULE } from "./catalog.js";

/**
 * Maps recurring ad-budget failures to minimal harness guardrails. Most fixes
 * are a single declarative rule. The `overspend` cluster offers an over-broad
 * candidate first — a blanket `freeze-all-budget-changes` rule, which stops the
 * overspend but also blocks every legitimate in-cap budget action — so the
 * regression gate has a real over-reach to reject before it accepts the sound
 * `cap-daily-budget-change` rule. Safety edits are still edits: the gate rejects
 * a guardrail that breaks legitimate actions, however well-intentioned.
 */
export class PmHeuristicProposer implements Proposer {
  async propose(
    _harness: Harness,
    cluster: FailureCluster,
    _suite: SuiteResult,
  ): Promise<HarnessPatch[]> {
    if (cluster.pattern === "overspend") {
      return [
        makePatch("pm-patch", "overspend", "Freeze all budget changes to stop the overspend.", [
          { op: "addRule", text: OVERBROAD_FREEZE_RULE },
        ]),
        makePatch(
          "pm-patch",
          "overspend",
          "Cap each budget change to the daily limit instead of freezing.",
          [{ op: "addRule", text: GUARDRAIL_RULE.overspend }],
        ),
      ];
    }
    const rule = RULE_FOR_CLUSTER[cluster.pattern];
    if (!rule) return [];
    return [
      makePatch("pm-patch", cluster.pattern, `Adopt the "${rule}" guardrail.`, [
        { op: "addRule", text: rule },
      ]),
    ];
  }
}

const RULE_FOR_CLUSTER: Record<string, string | undefined> = {
  ungrounded: GUARDRAIL_RULE.ungrounded,
  "self-approve": GUARDRAIL_RULE["self-approve"],
  "no-trigger": GUARDRAIL_RULE["no-trigger"],
  unlogged: GUARDRAIL_RULE.unlogged,
};
