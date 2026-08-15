import { describe, expect, it } from "vitest";
import { DsAgent } from "./examples/data-science/ds-agent.js";
import { refiningDsScriptedModel } from "./examples/data-science/ds-model.js";
import { buildDsSuite } from "./examples/data-science/tasks.js";
import { defaultHarness } from "./harness.js";
import { selfHarness } from "./loop.js";
import { clusterFailures } from "./cluster.js";
import { runSuite } from "./runner.js";
import { RefiningModelProposer } from "./refining-proposer.js";
import { ScriptedModel } from "./models/scripted.js";

describe("RefiningModelProposer", () => {
  it("reaches 100% and records a reject→refine step for runaway-training", async () => {
    const agent = new DsAgent();
    const tasks = buildDsSuite(4);
    const proposer = new RefiningModelProposer({
      model: refiningDsScriptedModel(),
      agent,
      tasks,
    });

    const result = await selfHarness({
      agent,
      proposer,
      tasks,
      initialHarness: defaultHarness(),
    });

    expect(result.finalPassRate).toBe(1);

    // The runaway-training cluster took two attempts: the blunt clamp was
    // rejected, then the refined early-stopping rule was accepted.
    const runaway = proposer.refinements().filter((a) => a.cluster === "runaway-training");
    expect(runaway.length).toBe(2);
    expect(runaway[0]?.accepted).toBe(false);
    expect(runaway[0]?.regressions.length).toBeGreaterThan(0);
    expect(runaway[1]?.accepted).toBe(true);

    // Every other pattern was fixed on the first attempt — refinement only kicks
    // in when the gate actually pushes back.
    const others = proposer.refinements().filter((a) => a.cluster !== "runaway-training");
    expect(others.every((a) => a.attempt === 1 && a.accepted)).toBe(true);
  });

  it("gives up after maxAttempts when the model never produces a passing edit", async () => {
    const agent = new DsAgent();
    const tasks = buildDsSuite(1);
    const before = await runSuite(agent, defaultHarness(), tasks);
    const cluster = clusterFailures(before)[0];
    expect(cluster).toBeDefined();

    // A model that always answers with an empty (no-op) edit can never pass.
    const stubborn = new ScriptedModel([], () => "[]");
    const proposer = new RefiningModelProposer({
      model: stubborn,
      agent,
      tasks,
      maxAttempts: 2,
    });

    const candidates = await proposer.propose(defaultHarness(), cluster!, before);
    expect(candidates).toEqual([]);
    const attempts = proposer.refinements();
    expect(attempts.length).toBe(2);
    expect(attempts.every((a) => !a.accepted)).toBe(true);
  });
});
