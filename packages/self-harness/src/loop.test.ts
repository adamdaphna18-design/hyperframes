import { describe, expect, it } from "vitest";
import { SimulatedAgent } from "./agents/simulated.js";
import { defaultHarness } from "./harness.js";
import { selfHarness } from "./loop.js";
import { HeuristicProposer } from "./proposer.js";
import { buildDemoSuite } from "./demo/pathologies.js";

describe("selfHarness loop", () => {
  it("drives the demo suite from partial to full pass rate without regressions", async () => {
    const result = await selfHarness({
      agent: new SimulatedAgent(),
      proposer: new HeuristicProposer(),
      tasks: buildDemoSuite(),
      initialHarness: defaultHarness(),
    });

    // Only the 2 healthy tasks pass at first (2/8 = 0.25).
    expect(result.initialPassRate).toBeCloseTo(0.25, 5);
    // Every pathology gets fixed.
    expect(result.finalPassRate).toBe(1);
    expect(result.stoppedBecause).toBe("all tasks pass");

    // The final harness is a fingerprint of the three pathologies.
    expect(result.finalHarness.limits.avoidRepeatedFailures).toBe(true);
    expect(result.finalHarness.limits.persistEnvAcrossSessions).toBe(true);
    expect(result.finalHarness.limits.maxToolCalls).toBe(50);
  });

  it("demonstrates the gate rejecting the over-aggressive cap before accepting a sound one", async () => {
    const decisions: string[] = [];
    await selfHarness({
      agent: new SimulatedAgent(),
      proposer: new HeuristicProposer(),
      tasks: buildDemoSuite(),
      initialHarness: defaultHarness(),
      onEvent: (e) => {
        if (e.type === "gate") decisions.push(`${e.decision.accepted}`);
      },
    });

    // At least one rejection (the cap=3 candidate) occurred over the run.
    expect(decisions).toContain("false");
    expect(decisions).toContain("true");
  });

  it("never commits a patch that regresses a passing task", async () => {
    const passSnapshots: number[] = [];
    const result = await selfHarness({
      agent: new SimulatedAgent(),
      proposer: new HeuristicProposer(),
      tasks: buildDemoSuite(),
      initialHarness: defaultHarness(),
      onEvent: (e) => {
        if (e.type === "round-start") passSnapshots.push(e.passRate);
      },
    });

    // Pass rate is monotonically non-decreasing across committed rounds.
    for (let i = 1; i < passSnapshots.length; i++) {
      const prev = passSnapshots[i - 1] ?? 0;
      const cur = passSnapshots[i] ?? 0;
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
    expect(result.finalPassRate).toBe(1);
  });
});
