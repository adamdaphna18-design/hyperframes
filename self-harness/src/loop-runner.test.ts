import { describe, expect, it } from "vitest";
import { makeSimTask, SimulatedAgent, type SimTask } from "./agents/simulated.js";
import { defaultHarness } from "./harness.js";
import { runSelfHarnessLoop } from "./loop-runner.js";
import { HeuristicProposer } from "./proposer.js";
import type { Task } from "./types.js";

const runawayTasks = (): SimTask[] => [
  makeSimTask("explore-audit", "runaway-exploration", "Audit the repo and write findings.md."),
  makeSimTask("explore-report", "runaway-exploration", "Summarize the logs into report.md."),
];

const envTasks = (): SimTask[] => [
  makeSimTask("env-token", "lost-env-var", "Set an auth token, then call the API with it."),
  makeSimTask("env-path", "lost-env-var", "Export a PATH entry, then run the installed tool."),
];

describe("runSelfHarnessLoop", () => {
  it("converges to a stable harness and stops re-learning nothing", async () => {
    const result = await runSelfHarnessLoop({
      agent: new SimulatedAgent(),
      proposer: new HeuristicProposer(),
      initialHarness: defaultHarness(),
      initialTasks: [
        makeSimTask("healthy-deploy", "healthy", "Deploy the service.", 12),
        ...runawayTasks(),
        ...envTasks(),
      ],
      maxIterations: 5,
      convergenceRounds: 1,
    });

    // Iteration 1 learns rules (progress); iteration 2 finds nothing left to do.
    expect(result.stoppedBecause).toBe("converged");
    expect(result.iterations).toHaveLength(2);

    const first = result.iterations[0];
    const second = result.iterations[1];
    expect(first?.madeProgress).toBe(true);
    expect(second?.madeProgress).toBe(false);

    // The accumulated harness is a fingerprint of both pathologies.
    expect(result.finalHarness.limits.persistEnvAcrossSessions).toBe(true);
    expect(result.finalHarness.limits.maxToolCalls).toBe(50);
    expect(result.finalHarness.rules.length).toBeGreaterThan(0);

    // Memory renders the progress markdown the guide describes.
    expect(result.memoryMarkdown).toContain("progress.md");
    expect(result.memoryMarkdown).toContain("Stopped because:** converged");
  });

  it("respects the maxIterations budget when the suite keeps growing unfixably", async () => {
    // Each iteration adds a fresh healthy task whose legit tool-call need exceeds
    // any cap the heuristic proposer offers, so it never passes and never
    // clusters into a fixable pattern — the loop can only stop on the budget.
    const growSuite = (iteration: number): Task[] => [
      makeSimTask(`grow-${iteration}`, "healthy", "An impossible amount of work.", 5000),
    ];

    const result = await runSelfHarnessLoop({
      agent: new SimulatedAgent(),
      proposer: new HeuristicProposer(),
      initialHarness: defaultHarness(),
      initialTasks: [makeSimTask("healthy-deploy", "healthy", "Deploy the service.", 12)],
      growSuite,
      maxIterations: 3,
      convergenceRounds: 2,
    });

    expect(result.stoppedBecause).toBe("reached maxIterations");
    expect(result.iterations).toHaveLength(3);
    // A new failing task appears every iteration, so none is ever quiet.
    expect(result.iterations.every((it) => it.madeProgress)).toBe(true);
  });

  it("hardens against tasks that growSuite introduces over time", async () => {
    const growSuite = (iteration: number): Task[] => {
      if (iteration === 1) return runawayTasks();
      if (iteration === 2) return envTasks();
      return [];
    };

    const result = await runSelfHarnessLoop({
      agent: new SimulatedAgent(),
      proposer: new HeuristicProposer(),
      initialHarness: defaultHarness(),
      initialTasks: [makeSimTask("healthy-migrate", "healthy", "Run the migration.", 12)],
      growSuite,
      maxIterations: 10,
      convergenceRounds: 2,
    });

    // The grown tasks were each failing when introduced, then fixed by the gate.
    const fixed = result.iterations.flatMap((it) => it.newlyPassingTaskIds);
    expect(fixed).toContain("explore-audit");
    expect(fixed).toContain("env-token");

    // Two productive iterations, then two quiet ones trigger convergence.
    expect(result.stoppedBecause).toBe("converged");
    expect(result.finalHarness.limits.maxToolCalls).toBe(50);
    expect(result.finalHarness.limits.persistEnvAcrossSessions).toBe(true);
  });
});
