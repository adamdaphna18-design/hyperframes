import { makePatch } from "../../patch-factory.js";
import type { FailureCluster, Harness, HarnessPatch, Proposer, SuiteResult } from "../../types.js";

/**
 * Maps real HTTP failure clusters to minimal harness edits — all expressed as
 * rules the {@link HttpAgent} reads, plus the shared `maxToolCalls` budget.
 * Where useful it offers an over-aggressive candidate first so the regression
 * gate has something to reject (e.g. a retry fix that also starves the paged
 * endpoint's attempt budget).
 */
export class HttpHeuristicProposer implements Proposer {
  // Dispatched through the Proposer interface by the loop.
  async propose(
    _harness: Harness,
    cluster: FailureCluster,
    _suite: SuiteResult,
  ): Promise<HarnessPatch[]> {
    switch (cluster.pattern) {
      case "request-timeout":
        return [
          makePatch("http-patch", "request-timeout", "Nudge the timeout up a little.", [
            { op: "addRule", text: "timeout-ms=200" },
          ]),
          makePatch("http-patch", "request-timeout", "Give slow endpoints a realistic timeout.", [
            { op: "addRule", text: "timeout-ms=2000" },
          ]),
        ];
      case "http-429-no-retry":
        return [
          makePatch(
            "http-patch",
            "http-429-no-retry",
            "Retry on 429, but clamp the attempt budget hard.",
            [
              { op: "addRule", text: "retry-on-429" },
              { op: "setLimit", key: "maxToolCalls", value: 1 },
            ],
          ),
          makePatch("http-patch", "http-429-no-retry", "Retry once on a 429 rate-limit response.", [
            { op: "addRule", text: "retry-on-429" },
          ]),
        ];
      case "redirect-not-followed":
        return [
          makePatch("http-patch", "redirect-not-followed", "Follow HTTP→HTTPS redirects.", [
            { op: "addRule", text: "follow-redirects" },
          ]),
        ];
      default:
        return [];
    }
  }
}
