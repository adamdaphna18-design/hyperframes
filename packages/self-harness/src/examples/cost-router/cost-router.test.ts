import { describe, expect, it } from "vitest";
import { defaultHarness } from "../../harness.js";
import { runSuite } from "../../runner.js";
import { drivenCampaign, expectLearnsUnderGate } from "../campaign-fixture.js";
import { requestCost, routingCost, savingsReport } from "./cost.js";
import { CostProposer } from "./cost-proposer.js";
import { buildRequests } from "./requests.js";
import { CostRouter } from "./router-agent.js";
import { buildCostSuite } from "./tasks.js";
import {
  COST_CUT_RULE,
  MIN_TIER_FOR_CLASS,
  TOP_TIER,
  parseRoute,
  routeRule,
  tierById,
  type RequestClass,
  type TierId,
} from "./tiers.js";

const LEARNED = [
  routeRule("extract", "sonnet"),
  routeRule("code", "sonnet"),
  routeRule("reason", "opus"),
  routeRule("analyze", "opus"),
];

describe("cost math is grounded in the tier price sheet", () => {
  it("prices a request from its token profile and tier", () => {
    // 1000 in + 1000 out on sonnet ($3 / $15 per MTok) = $0.003 + $0.015.
    expect(requestCost("sonnet", { inTokens: 1000, outTokens: 1000 })).toBeCloseTo(0.018, 9);
    // A stronger tier is never cheaper for the same request.
    const tokens = { inTokens: 1200, outTokens: 800 };
    expect(requestCost("opus", tokens)).toBeGreaterThan(requestCost("sonnet", tokens));
  });

  it("the cautious all-opus default is the most expensive routing", () => {
    const reqs = buildRequests();
    const allOpus = routingCost(reqs, () => TOP_TIER);
    const minViable = routingCost(reqs, (r) => MIN_TIER_FOR_CLASS[r.cls]);
    expect(minViable).toBeLessThan(allOpus);
  });
});

describe("CostRouter under the naive harness", () => {
  it("serves the haiku classes and under-serves everything that needs more", async () => {
    const suite = await runSuite(new CostRouter(), defaultHarness(), buildCostSuite());
    const byId = new Map(suite.results.map((r) => [r.taskId, r]));
    expect(byId.get("faq-0")?.passed).toBe(true);
    expect(byId.get("classify-0")?.passed).toBe(true);
    expect(byId.get("summarize-0")?.passed).toBe(true);
    expect(byId.get("extract-0")?.passed).toBe(false);
    expect(byId.get("code-0")?.passed).toBe(false);
    expect(byId.get("reason-0")?.trajectory.failureSignals).toContain("reason");
    // 12 of 23 requests (the three haiku classes) clear at baseline.
    expect(suite.passed).toBe(12);
  });
});

describe("Self-Harness over the LLM workload", () => {
  it("reaches 100% quality and rejects the force-cheapest-tier rule", async () => {
    const { result, decisions } = await drivenCampaign(
      new CostRouter(),
      new CostProposer(),
      buildCostSuite(),
    );
    expectLearnsUnderGate(result, decisions, LEARNED);
    // The over-aggressive cost rule was never committed.
    expect(result.finalHarness.rules).not.toContain(COST_CUT_RULE);
    // Every learned rule is a per-class route to at least the class's min tier.
    for (const rule of result.finalHarness.rules) {
      const parsed = parseRoute(rule);
      expect(parsed).not.toBeNull();
      const { cls, tier } = parsed as { cls: RequestClass; tier: TierId };
      expect(tierById(tier).capability).toBeGreaterThanOrEqual(
        tierById(MIN_TIER_FOR_CLASS[cls]).capability,
      );
    }
  });

  it("cuts the bill at identical quality — the money the router makes", async () => {
    const { result } = await drivenCampaign(new CostRouter(), new CostProposer(), buildCostSuite());
    const routes = new Map<RequestClass, TierId>();
    for (const rule of result.finalHarness.rules) {
      const parsed = parseRoute(rule);
      if (parsed) routes.set(parsed.cls, parsed.tier);
    }
    const report = savingsReport(
      buildRequests(),
      (req) => routes.get(req.cls) ?? MIN_TIER_FOR_CLASS[req.cls],
      1_000_000,
    );
    expect(report.savings).toBeGreaterThan(0);
    expect(report.learnedCost).toBeLessThan(report.defaultCost);
    // The workload is cut by roughly half at 100% quality — a real, honest wedge.
    expect(report.savingsPct).toBeGreaterThan(0.4);
    expect(report.monthlySavings).toBeGreaterThan(0);
  });
});
