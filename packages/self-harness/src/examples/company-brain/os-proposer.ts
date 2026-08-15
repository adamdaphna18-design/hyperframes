import { makePatch } from "../../patch-factory.js";
import type { FailureCluster, Harness, HarnessPatch, Proposer, SuiteResult } from "../../types.js";
import { HARMFUL_SEO_RULE, PLAYBOOK_FOR_VERTICAL } from "./verticals.js";

/**
 * Proposes the playbook each under-performing vertical needs. The SEO cluster
 * offers an over-aggressive candidate first — it lifts organic sessions by
 * stuffing keywords, which wrecks the brand voice CONTENT already nails — so the
 * regression gate has a real cross-vertical regression to reject before it
 * accepts the clean, targeted playbook. Growth edits are still edits: one that
 * lifts a lagging vertical by breaking a performing one is disqualified.
 */
export class CompanyPlaybookProposer implements Proposer {
  // Dispatched through the Proposer interface by the loop.
  async propose(
    _harness: Harness,
    cluster: FailureCluster,
    _suite: SuiteResult,
  ): Promise<HarnessPatch[]> {
    if (cluster.pattern === "seo") {
      return [
        makePatch("brain-patch", "seo", "Stuff every keyword to spike organic sessions.", [
          { op: "addRule", text: "target-intent-keywords" },
          { op: "addRule", text: HARMFUL_SEO_RULE },
        ]),
        makePatch(
          "brain-patch",
          "seo",
          "Target high-intent keywords without harming brand voice.",
          [{ op: "addRule", text: "target-intent-keywords" }],
        ),
      ];
    }
    const playbook = PLAYBOOK_FOR_VERTICAL[cluster.pattern];
    if (!playbook) return [];
    return [
      makePatch("brain-patch", cluster.pattern, `Adopt the "${playbook}" playbook.`, [
        { op: "addRule", text: playbook },
      ]),
    ];
  }
}
