import { describe, expect, it } from "vitest";
import { applyPatch, defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { AgenticDsAgent, RuleAwareModel } from "./agentic-agent.js";
import { DsHeuristicProposer } from "./ds-proposer.js";
import { buildDsSuite } from "./tasks.js";

const agent = new AgenticDsAgent(new RuleAwareModel());

const titanic = () => {
  const task = buildDsSuite(1).find((t) => t.id === "titanic-survival-prediction");
  if (!task) throw new Error("fixture missing");
  return task;
};

describe("RuleAwareModel", () => {
  it("applies a practice only when its rule is in the system prompt", async () => {
    const model = new RuleAwareModel();
    const user =
      'Project X. Will you apply the "seed-everything" practice? Reply APPLIED or SKIPPED.';
    expect(await model.complete({ system: "Rules:\n- seed-everything", user })).toBe("APPLIED");
    expect(await model.complete({ system: "Rules:\n- other", user })).toBe("SKIPPED");
  });
});

describe("AgenticDsAgent", () => {
  it("walks the workflow and skips the practice when the rule is absent", async () => {
    const trajectory = await agent.run(defaultHarness(), titanic());
    expect(trajectory.failureSignals).toContain("data-leakage");
    // The staged workflow is visible in the trajectory.
    expect(trajectory.toolCalls.some((c) => c.name === "stage")).toBe(true);
    expect(trajectory.toolCalls.some((c) => c.name === "decide" && !c.ok)).toBe(true);
  });

  it("applies the practice once the rule is in the harness", async () => {
    const task = titanic();
    const harness = applyPatch(defaultHarness(), {
      id: "p",
      targetPattern: "data-leakage",
      rationale: "",
      ops: [{ op: "addRule", text: "fit-transforms-on-train-only" }],
    });
    const trajectory = await agent.run(harness, task);
    expect(trajectory.failureSignals).toEqual([]);
    expect(task.check(trajectory.output).passed).toBe(true);
  });
});

describe("selfHarness governs the model-driven agent", () => {
  it("tunes the harness so the agentic agent reaches 100%", async () => {
    const result = await selfHarness({
      agent,
      proposer: new DsHeuristicProposer(),
      tasks: buildDsSuite(4),
      initialHarness: defaultHarness(),
    });

    expect(result.finalPassRate).toBe(1);
    expect(result.finalHarness.rules).toEqual(
      expect.arrayContaining([
        "fit-transforms-on-train-only",
        "seed-everything",
        "handle-missing-values",
        "handle-class-imbalance",
        "use-early-stopping",
      ]),
    );
    // The over-aggressive compute clamp was rejected — heavy projects survive.
    expect(result.finalHarness.limits.maxToolCalls).toBe(1000);
  });
});
