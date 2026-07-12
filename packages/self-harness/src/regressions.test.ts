import { describe, expect, it } from "vitest";
import { clusterFailures } from "./cluster.js";
import { defaultHarness } from "./harness.js";
import { selfHarness } from "./loop.js";
import { runSelfHarnessLoop } from "./loop-runner.js";
import { ScriptedModel } from "./models/scripted.js";
import { makePatch } from "./patch-factory.js";
import { parseOps } from "./proposer.js";
import { RefiningModelProposer } from "./refining-proposer.js";
import { runSuite } from "./runner.js";
import type {
  Agent,
  FailureCluster,
  Harness,
  Proposer,
  SuiteResult,
  Task,
  Trajectory,
} from "./types.js";
import { DsAgent } from "./examples/data-science/ds-agent.js";
import { buildDsSuite } from "./examples/data-science/tasks.js";

/**
 * Regression tests for bugs found by the layer-by-layer audit. Each test fails on
 * the pre-fix code and passes after the fix.
 */

// ── Fix 1: a stuck cluster is re-opened once the harness changes (loop.ts) ──────
// A cluster whose only fix needs a rule learned *later* was abandoned forever.
interface DepTask extends Task {
  need: string[];
  signal: string;
}
function depTask(id: string, signal: string, need: string[]): DepTask {
  return { id, prompt: id, need, signal, check: (o) => ({ passed: o === "OK", detail: o }) };
}
class DepAgent implements Agent {
  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const t = task as DepTask;
    const has = new Set(harness.rules);
    const passed = t.need.every((r) => has.has(r));
    return {
      taskId: t.id,
      toolCalls: [],
      output: passed ? "OK" : "FAIL",
      failureSignals: passed ? [] : [t.signal],
    };
  }
}
class DepProposer implements Proposer {
  async propose(_h: Harness, cluster: FailureCluster): Promise<HarnessPatchList> {
    const rule = ({ a: "RA", b: "RB" } as Record<string, string | undefined>)[cluster.pattern];
    if (!rule) return [];
    return [makePatch("dep", cluster.pattern, "", [{ op: "addRule", text: rule }])];
  }
}
type HarnessPatchList = Awaited<ReturnType<Proposer["propose"]>>;

describe("loop re-opens stuck clusters after the harness changes", () => {
  it("fixes a cluster whose fix depended on a rule learned in a later round", async () => {
    // A1,A2 need BOTH rules; B needs only RB. Cluster "a" is targeted first, gets
    // stuck (RA alone doesn't fix it), then "b" adds RB — which re-opens "a".
    const tasks = [
      depTask("a1", "a", ["RA", "RB"]),
      depTask("a2", "a", ["RA", "RB"]),
      depTask("b1", "b", ["RB"]),
    ];
    const result = await selfHarness({
      agent: new DepAgent(),
      proposer: new DepProposer(),
      tasks,
      initialHarness: defaultHarness(),
    });
    // Pre-fix: "a" stays stuck forever → 33%. Post-fix: "a" re-opens → 100%.
    expect(result.finalPassRate).toBe(1);
  });
});

// ── Fix 2: outer-loop progress counts a limit-only fix (loop-runner.ts) ─────────
class LimitAgent implements Agent {
  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const ok = harness.limits.avoidRepeatedFailures;
    return {
      taskId: task.id,
      toolCalls: [],
      output: ok ? "OK" : "FAIL",
      failureSignals: ok ? [] : ["needs-limit"],
    };
  }
}
class LimitProposer implements Proposer {
  async propose(_h: Harness, cluster: FailureCluster): Promise<HarnessPatchList> {
    if (cluster.pattern !== "needs-limit") return [];
    return [
      makePatch("lim", "needs-limit", "", [
        { op: "setLimit", key: "avoidRepeatedFailures", value: true },
      ]),
    ];
  }
}

describe("outer loop counts a limit-only fix as progress", () => {
  it("does not score an iteration that flips a task via setLimit as quiet", async () => {
    const result = await runSelfHarnessLoop({
      agent: new LimitAgent(),
      proposer: new LimitProposer(),
      initialHarness: defaultHarness(),
      initialTasks: [{ id: "t", prompt: "t", check: (o) => ({ passed: o === "OK", detail: o }) }],
      maxIterations: 3,
      convergenceRounds: 2,
    });
    const first = result.iterations[0];
    expect(first?.learnedRules).toEqual([]); // fixed with no rule…
    expect(first?.harnessDiff.length).toBeGreaterThan(0); // …only a limit change
    expect(first?.madeProgress).toBe(true); // …yet it counts as progress
  });
});

// ── Fix 3: parseOps tolerates brackets outside the JSON array (proposer.ts) ─────
describe("parseOps survives bracketed prose", () => {
  it("extracts ops despite a leading citation or trailing footnote", () => {
    expect(parseOps('As in [RFC], here: [{"op":"addRule","text":"x"}]')).toEqual([
      { op: "addRule", text: "x" },
    ]);
    expect(parseOps('[{"op":"addRule","text":"x"}]. See note [1].')).toEqual([
      { op: "addRule", text: "x" },
    ]);
    expect(parseOps("no ops at all")).toEqual([]);
    expect(
      parseOps('[{"op":"addRule","text":"a"},{"op":"setLimit","key":"maxToolCalls","value":50}]'),
    ).toHaveLength(2);
    // A bracket inside a rule's text must not close the array early.
    expect(parseOps('[{"op":"addRule","text":"cap loops [hard]"}]')).toEqual([
      { op: "addRule", text: "cap loops [hard]" },
    ]);
  });
});

// ── Fix 4: RefiningModelProposer clamps maxAttempts to ≥1 (refining-proposer.ts) ─
describe("refining proposer clamps maxAttempts", () => {
  it("still asks the model once when maxAttempts is 0", async () => {
    const agent = new DsAgent();
    const tasks = buildDsSuite(1);
    const suite: SuiteResult = await runSuite(agent, defaultHarness(), tasks);
    const cluster = clusterFailures(suite)[0];
    expect(cluster).toBeDefined();
    const model = new ScriptedModel([
      { match: "data-leakage", reply: '[{"op":"addRule","text":"fit-transforms-on-train-only"}]' },
    ]);
    const proposer = new RefiningModelProposer({ model, agent, tasks, maxAttempts: 0 });
    await proposer.propose(defaultHarness(), cluster as FailureCluster, suite);
    expect(proposer.refinements().length).toBeGreaterThanOrEqual(1);
  });
});
