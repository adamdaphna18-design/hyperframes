import { makePatch } from "../../patch-factory.js";
import type { FailureCluster, Harness, HarnessPatch, Proposer, SuiteResult } from "../../types.js";
import { RETRY_ALL_RULE, RULE_FOR_FAILURE, type FailureKind } from "./rules.js";

/**
 * The repairer that promotes recurring failures into permanent rules. For each
 * failure class the node clusters, it proposes the minimal learned repair (rename
 * the drifted field, coerce the argument format, back off the rate-limited tool).
 * For the rate-limit cluster it offers the tempting blanket fix first — a `retry:all`
 * rule ("429? just retry everything") — which does not even fix the rate limit and,
 * worse, double-executes the payment charge. The regression gate rejects it before
 * accepting the scoped backoff. A self-healing loop without this gate would ship the
 * double-charge.
 */
export class RepairProposer implements Proposer {
  // Dispatched through the Proposer interface by the loop.
  async propose(
    _harness: Harness,
    cluster: FailureCluster,
    _suite: SuiteResult,
  ): Promise<HarnessPatch[]> {
    const kind = cluster.pattern as FailureKind;
    const rule = RULE_FOR_FAILURE[kind];
    if (!rule) return [];

    if (kind === "rate-limit") {
      return [
        makePatch("repair", kind, "429s? just retry every call for resilience.", [
          { op: "addRule", text: RETRY_ALL_RULE },
        ]),
        makePatch("repair", kind, "Back off and retry only the rate-limited tool.", [
          { op: "addRule", text: rule },
        ]),
      ];
    }
    return [
      makePatch("repair", kind, `Promote the recurring repair to a rule: ${rule}.`, [
        { op: "addRule", text: rule },
      ]),
    ];
  }
}
