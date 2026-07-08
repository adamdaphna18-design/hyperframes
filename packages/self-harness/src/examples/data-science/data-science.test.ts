import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultHarness } from "../../harness.js";
import { runSelfHarnessLoop } from "../../loop-runner.js";
import { runSuite } from "../../runner.js";
import { drivenCampaign, expectLearnsUnderGate } from "../campaign-fixture.js";
import { DsAgent } from "./ds-agent.js";
import { DsHeuristicProposer } from "./ds-proposer.js";
import { buildDsSuite, dsTasksAtLevel, growByLevel } from "./tasks.js";
import { runDataScienceDemo } from "./run.js";

const agent = new DsAgent();

const LEARNED = [
  "fit-transforms-on-train-only",
  "seed-everything",
  "handle-missing-values",
  "handle-class-imbalance",
  "use-early-stopping",
];

describe("DsAgent under the naive harness", () => {
  it("passes healthy projects and fails each pitfall with its signal", async () => {
    const suite = await runSuite(agent, defaultHarness(), buildDsSuite(4));
    const byId = new Map(suite.results.map((r) => [r.taskId, r]));

    expect(byId.get("customer-churn")?.passed).toBe(true);
    expect(byId.get("gender-classification")?.passed).toBe(true); // heavy but budget is ample

    const signal = (id: string) => byId.get(id)?.trajectory.failureSignals ?? [];
    expect(signal("titanic-survival-prediction")).toContain("data-leakage");
    expect(signal("iris-flower-classification")).toContain("non-determinism");
    expect(signal("heart-failure-prediction")).toContain("unhandled-nan");
    expect(signal("song-lyrics-genre-classification")).toContain("class-imbalance");
    expect(signal("eye-disease-detection")).toContain("runaway-training");
  });
});

describe("selfHarness over the full DS suite", () => {
  it("reaches 100% and rejects the compute-clamp fix that would starve heavy projects", async () => {
    // The over-aggressive maxToolCalls=3 candidate is rejected (regression), so
    // the budget the heavy DL projects depend on survives (maxToolCalls stays 1000).
    const { result, decisions } = await drivenCampaign(
      agent,
      new DsHeuristicProposer(),
      buildDsSuite(4),
    );
    expectLearnsUnderGate(result, decisions, LEARNED);
  });
});

describe("outer loop growing through the four levels", () => {
  it("converges to a DS-agent harness fingerprint of five practices", async () => {
    const result = await runSelfHarnessLoop({
      agent,
      proposer: new DsHeuristicProposer(),
      initialHarness: defaultHarness(),
      initialTasks: dsTasksAtLevel(1),
      growSuite: growByLevel,
      maxIterations: 8,
      convergenceRounds: 2,
    });

    expect(result.stoppedBecause).toBe("converged");
    expect(result.finalHarness.rules).toEqual(expect.arrayContaining(LEARNED));
    // Rules learned on Level 1 transfer: Level 2 projects sharing a pitfall pass
    // on arrival, so class-imbalance is the only rule iteration 2 must learn.
    const iter2 = result.iterations[1];
    expect(iter2?.learnedRules).toEqual(["handle-class-imbalance"]);
    expect(result.memoryMarkdown).toContain("use-early-stopping");
  });
});

describe("data-science demo entry point", () => {
  afterEach(() => vi.restoreAllMocks());
  it("runs offline without throwing", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await expect(runDataScienceDemo()).resolves.toBeUndefined();
  });
});
