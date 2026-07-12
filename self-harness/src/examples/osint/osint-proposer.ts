import { makePatch } from "../../patch-factory.js";
import type { FailureCluster, Harness, HarnessPatch, Proposer, SuiteResult } from "../../types.js";
import { GUARDRAIL_RULE } from "./catalog.js";

/**
 * Maps recurring recon compliance failures to minimal harness guardrails. Most
 * fixes are a single declarative rule. The rate-limit-abuse cluster offers an
 * over-broad candidate first — a hard `maxToolCalls` throttle, which would starve
 * the corroboration-heavy probes that must cross-check several sources — so the
 * regression gate has a real over-reach to reject before it accepts the sound
 * `respect-rate-limits` rule. Safety edits are still edits: the gate rejects a
 * guardrail that breaks legitimate in-scope lookups, however well-intentioned.
 */
export class OsintHeuristicProposer implements Proposer {
  // Dispatched through the Proposer interface by the loop.
  // fallow-ignore-next-line unused-class-member
  async propose(
    _harness: Harness,
    cluster: FailureCluster,
    _suite: SuiteResult,
  ): Promise<HarnessPatch[]> {
    if (cluster.pattern === "rate-limit-abuse") {
      return [
        makePatch(
          "osint-patch",
          "rate-limit-abuse",
          "Throttle every source hard to stop the abuse.",
          [{ op: "setLimit", key: "maxToolCalls", value: 2 }],
        ),
        makePatch(
          "osint-patch",
          "rate-limit-abuse",
          "Adopt adaptive rate-limiting with back-off.",
          [{ op: "addRule", text: GUARDRAIL_RULE["rate-limit-abuse"] }],
        ),
      ];
    }
    const rule = RULE_FOR_CLUSTER[cluster.pattern];
    if (!rule) return [];
    return [
      makePatch("osint-patch", cluster.pattern, `Adopt the "${rule}" guardrail.`, [
        { op: "addRule", text: rule },
      ]),
    ];
  }
}

const RULE_FOR_CLUSTER: Record<string, string | undefined> = {
  "out-of-scope": GUARDRAIL_RULE["out-of-scope"],
  "pii-exposure": GUARDRAIL_RULE["pii-exposure"],
  "unverified-attribution": GUARDRAIL_RULE["unverified-attribution"],
  "no-provenance": GUARDRAIL_RULE["no-provenance"],
};
