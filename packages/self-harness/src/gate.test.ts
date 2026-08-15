import { describe, expect, it } from "vitest";
import { SimulatedAgent, makeSimTask } from "./agents/simulated.js";
import { regressionGate } from "./gate.js";
import { defaultHarness } from "./harness.js";
import { runSuite } from "./runner.js";
import type { HarnessPatch } from "./types.js";

const agent = new SimulatedAgent();

const suite = () => [
  makeSimTask("healthy", "healthy", "do the thing", 12),
  makeSimTask("runaway", "runaway-exploration", "audit and report"),
];

describe("regressionGate", () => {
  it("rejects an over-aggressive patch that regresses a passing task", async () => {
    const tasks = suite();
    const harness = defaultHarness();
    const baseline = await runSuite(agent, harness, tasks);
    expect(baseline.results.find((r) => r.taskId === "healthy")?.passed).toBe(true);

    const tooTight: HarnessPatch = {
      id: "cap3",
      targetPattern: "runaway-exploration",
      rationale: "cap hard",
      ops: [{ op: "setLimit", key: "maxToolCalls", value: 3 }],
    };
    const decision = await regressionGate(agent, harness, tooTight, tasks, baseline);

    expect(decision.accepted).toBe(false);
    expect(decision.regressions).toContain("healthy");
  });

  it("accepts a patch that fixes a failure with no regressions", async () => {
    const tasks = suite();
    const harness = defaultHarness();
    const baseline = await runSuite(agent, harness, tasks);

    const sound: HarnessPatch = {
      id: "cap50",
      targetPattern: "runaway-exploration",
      rationale: "bounded ceiling",
      ops: [{ op: "setLimit", key: "maxToolCalls", value: 50 }],
    };
    const decision = await regressionGate(agent, harness, sound, tasks, baseline);

    expect(decision.accepted).toBe(true);
    expect(decision.newlyPassing).toContain("runaway");
    expect(decision.regressions).toEqual([]);
  });

  it("rejects a no-op patch (no net improvement)", async () => {
    const tasks = [makeSimTask("healthy", "healthy", "do the thing", 12)];
    const harness = defaultHarness();
    const baseline = await runSuite(agent, harness, tasks);

    const noop: HarnessPatch = {
      id: "noop",
      targetPattern: "none",
      rationale: "",
      ops: [{ op: "addRule", text: "cosmetic rule" }],
    };
    const decision = await regressionGate(agent, harness, noop, tasks, baseline);

    expect(decision.accepted).toBe(false);
    expect(decision.reason).toMatch(/no net improvement/);
  });
});
