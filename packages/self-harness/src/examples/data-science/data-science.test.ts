import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { runSelfHarnessLoop } from "../../loop-runner.js";
import { runSuite } from "../../runner.js";
import { DsAgent } from "./ds-agent.js";
import { DsHeuristicProposer } from "./ds-proposer.js";
import { buildDsSuite, dsTasksAtLevel } from "./tasks.js";
import { runDataScienceDemo } from "./run.js";
import type { DsLevel } from "./projects.js";

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
    const decisions: boolean[] = [];
    const result = await selfHarness({
      agent,
      proposer: new DsHeuristicProposer(),
      tasks: buildDsSuite(4),
      initialHarness: defaultHarness(),
      onEvent: (e) => {
        if (e.type === "gate") decisions.push(e.decision.accepted);
      },
    });

    expect(result.finalPassRate).toBe(1);
    expect(result.finalHarness.rules).toEqual(expect.arrayContaining(LEARNED));
    // The over-aggressive maxToolCalls=3 candidate was rejected (regression),
    // so the budget the heavy DL projects depend on survives.
    expect(result.finalHarness.limits.maxToolCalls).toBe(1000);
    expect(decisions).toContain(false);
    expect(decisions).toContain(true);
  });
});

describe("outer loop growing through the four levels", () => {
  it("converges to a DS-agent harness fingerprint of five practices", async () => {
    const result = await runSelfHarnessLoop({
      agent,
      proposer: new DsHeuristicProposer(),
      initialHarness: defaultHarness(),
      initialTasks: dsTasksAtLevel(1),
      growSuite: (iteration) => {
        const level = iteration as DsLevel;
        return level >= 2 && level <= 4 ? dsTasksAtLevel(level) : [];
      },
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
