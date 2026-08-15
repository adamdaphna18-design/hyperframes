import { describe, expect, it } from "vitest";
import { defaultHarness } from "../../harness.js";
import { runSuite } from "../../runner.js";
import { drivenCampaign, expectLearnsUnderGate } from "../campaign-fixture.js";
import { pickSpecialist, Router } from "./router-agent.js";
import { RouterProposer } from "./router-proposer.js";
import { BEST_SPECIALIST, DOMAINS, SPECIALISTS } from "./specialists.js";
import { buildRouterSuite } from "./tasks.js";

const agent = new Router();

describe("routing policy", () => {
  it("resolves exact route, then catch-all, then default", () => {
    expect(pickSpecialist([], "math")).toBe("generalist"); // default
    expect(pickSpecialist(["route:math=math-pro"], "math")).toBe("math-pro"); // exact
    expect(pickSpecialist(["route:*=code-pro"], "reasoning")).toBe("code-pro"); // catch-all
    // Exact route wins over the catch-all.
    expect(pickSpecialist(["route:*=code-pro", "route:math=math-pro"], "math")).toBe("math-pro");
  });
});

describe("Router under the empty policy", () => {
  it("answers only knowledge (the default generalist), misrouting the rest", async () => {
    const suite = await runSuite(agent, defaultHarness(), buildRouterSuite());
    const byId = new Map(suite.results.map((r) => [r.taskId, r]));
    expect(byId.get("know-1")?.passed).toBe(true);
    expect(byId.get("math-1")?.passed).toBe(false);
    expect(byId.get("math-1")?.trajectory.failureSignals).toContain("math");
  });
});

describe("Self-Harness over the router benchmark", () => {
  it("learns the policy and rejects the greedy catch-all that misroutes knowledge", async () => {
    const learnedRoutes = DOMAINS.filter((d) => BEST_SPECIALIST[d] !== "generalist").map(
      (d) => `route:${d}=${BEST_SPECIALIST[d]}`,
    );
    const { result, decisions } = await drivenCampaign(
      agent,
      new RouterProposer(),
      buildRouterSuite(),
    );
    expectLearnsUnderGate(result, decisions, learnedRoutes);
    // The catch-all route:* was never committed — the gate caught the knowledge misroute.
    expect(result.finalHarness.rules).not.toContain("route:*=math-pro");
  });

  it("beats every individual specialist — smart routing over brute force", async () => {
    const { result } = await drivenCampaign(agent, new RouterProposer(), buildRouterSuite());
    let bestSingle = 0;
    for (const s of SPECIALISTS) {
      const solo = { ...defaultHarness(), rules: [`route:*=${s.id}`] };
      bestSingle = Math.max(bestSingle, (await runSuite(agent, solo, buildRouterSuite())).passRate);
    }
    expect(result.finalPassRate).toBe(1);
    expect(result.finalPassRate).toBeGreaterThan(bestSingle);
    expect(bestSingle).toBeLessThanOrEqual(0.25); // any single model covers one of four domains
  });
});
