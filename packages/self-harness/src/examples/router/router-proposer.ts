import { makePatch } from "../../patch-factory.js";
import type { FailureCluster, Harness, HarnessPatch, Proposer, SuiteResult } from "../../types.js";
import { BEST_SPECIALIST, type Domain } from "./specialists.js";

/**
 * Proposes the routing rule each mis-answered domain needs. For the math cluster
 * it offers an over-broad candidate first — a catch-all `route:*=math-pro` that
 * fixes math but **misroutes the knowledge questions** the generalist was already
 * answering — so the regression gate has a real misroute to reject before it
 * accepts the targeted `route:math=math-pro`. Smart routing means routing each
 * domain to its specialist, not sending everything to the loudest one.
 */
export class RouterProposer implements Proposer {
  // Dispatched through the Proposer interface by the loop.
  // fallow-ignore-next-line unused-class-member
  async propose(
    _harness: Harness,
    cluster: FailureCluster,
    _suite: SuiteResult,
  ): Promise<HarnessPatch[]> {
    const domain = cluster.pattern as Domain;
    const best = BEST_SPECIALIST[domain];
    if (!best) return [];

    if (domain === "math") {
      return [
        makePatch("route-patch", "math", "Send every question to the math specialist.", [
          { op: "addRule", text: `route:*=${best}` },
        ]),
        makePatch("route-patch", "math", `Route math questions to ${best}.`, [
          { op: "addRule", text: `route:math=${best}` },
        ]),
      ];
    }
    return [
      makePatch("route-patch", domain, `Route ${domain} questions to ${best}.`, [
        { op: "addRule", text: `route:${domain}=${best}` },
      ]),
    ];
  }
}
