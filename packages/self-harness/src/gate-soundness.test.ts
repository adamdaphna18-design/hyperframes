import { describe, expect, it } from "vitest";
import { stabilizeAgent } from "./agents/stabilize.js";
import { regressionGate } from "./gate.js";
import { defaultHarness } from "./harness.js";
import { runSuite } from "./runner.js";
import type { Agent, Harness, HarnessPatch, Task, Trajectory } from "./types.js";

/**
 * The regression gate re-runs the suite to decide "did this patch break anything?".
 * That is only sound when the agent is deterministic. These tests make the assumption
 * explicit: a flaky agent produces a *phantom* regression on a harmless patch, and the
 * `stabilizeAgent` wrapper removes it.
 */

/** An agent whose one task fails on exactly the call indices in `failOn` (1-based). */
class ScheduledFlakyAgent implements Agent {
  private calls = 0;
  constructor(private readonly failOn: Set<number>) {}

  async run(_harness: Harness, task: Task): Promise<Trajectory> {
    this.calls += 1;
    const passed = !this.failOn.has(this.calls);
    return {
      taskId: task.id,
      toolCalls: [],
      output: JSON.stringify({ passed }),
      failureSignals: passed ? [] : ["flake"],
    };
  }
}

const flakyTask: Task = {
  id: "flaky",
  prompt: "a task whose agent is flaky",
  check(output: string) {
    const parsed: unknown = JSON.parse(output);
    const passed = Boolean((parsed as { passed?: boolean }).passed);
    return { passed, detail: passed ? "ok" : "flaked" };
  },
};

const NO_OP_PATCH: HarnessPatch = {
  id: "noop",
  targetPattern: "none",
  rationale: "adds an unrelated rule that cannot change the flaky task's behavior",
  ops: [{ op: "addRule", text: "unrelated-rule" }],
};

describe("the gate assumes a deterministic agent", () => {
  it("a flaky agent produces a phantom regression on a harmless patch", async () => {
    // The task passes on call 1 (the baseline) but fails on call 2 (the gate's re-run).
    const agent = new ScheduledFlakyAgent(new Set([2]));
    const harness = defaultHarness();
    const before = await runSuite(agent, harness, [flakyTask]);
    expect(before.passRate).toBe(1); // baseline saw it pass

    const decision = await regressionGate(agent, harness, NO_OP_PATCH, [flakyTask], before);
    // The no-op patch is blamed for a regression it did not cause — the gate is unsound
    // under nondeterminism.
    expect(decision.accepted).toBe(false);
    expect(decision.regressions).toContain("flaky");
  });
});

describe("stabilizeAgent restores the gate's soundness", () => {
  it("smooths an occasional flake so a harmless patch is not blamed", async () => {
    // A single blip (call 2) across five votes per suite-run is out-voted.
    const agent = stabilizeAgent(new ScheduledFlakyAgent(new Set([2])), 5);
    const harness = defaultHarness();
    const before = await runSuite(agent, harness, [flakyTask]);
    expect(before.passRate).toBe(1);

    const decision = await regressionGate(agent, harness, NO_OP_PATCH, [flakyTask], before);
    // No phantom regression now; the no-op is rejected for the correct reason.
    expect(decision.regressions).toHaveLength(0);
    expect(decision.accepted).toBe(false); // still rejected — it is a genuine no-op
    expect(decision.reason).toContain("no net improvement");
  });

  it("is a no-op over a deterministic agent — same verdict, majority intact", async () => {
    const deterministic = new ScheduledFlakyAgent(new Set()); // never fails
    const wrapped = stabilizeAgent(deterministic, 3);
    const suite = await runSuite(wrapped, defaultHarness(), [flakyTask]);
    expect(suite.passRate).toBe(1);
  });
});
