import { describe, expect, it } from "vitest";
import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { ModelProposer, parseOps } from "../../proposer.js";
import type { FailureCluster, SuiteResult } from "../../types.js";
import { DsAgent } from "./ds-agent.js";
import { dsScriptedModel } from "./ds-model.js";
import { buildDsSuite } from "./tasks.js";

const emptySuite: SuiteResult = { results: [], passed: 0, failed: 0, passRate: 0 };
const cluster = (pattern: string): FailureCluster => ({
  pattern,
  count: 1,
  taskIds: ["x"],
  examples: [`x: ${pattern}`],
});

const RULES: Record<string, string> = {
  "data-leakage": "fit-transforms-on-train-only",
  "non-determinism": "seed-everything",
  "unhandled-nan": "handle-missing-values",
  "class-imbalance": "handle-class-imbalance",
  "runaway-training": "use-early-stopping",
};

describe("dsScriptedModel authors the fix per cluster", () => {
  it("returns the addRule op a model would write for each pitfall", async () => {
    const model = dsScriptedModel();
    for (const [pattern, rule] of Object.entries(RULES)) {
      const proposer = new ModelProposer(model);
      const patches = await proposer.propose(defaultHarness(), cluster(pattern), emptySuite);
      expect(patches[0]?.ops).toEqual([{ op: "addRule", text: rule }]);
      expect(patches[0]?.id.startsWith("model-patch")).toBe(true);
    }
  });

  it("parseOps accepts the model's JSON", () => {
    expect(parseOps('[{"op":"addRule","text":"seed-everything"}]')).toEqual([
      { op: "addRule", text: "seed-everything" },
    ]);
  });
});

describe("the model authors the harness (rule creator path)", () => {
  it("drives the DS suite to 100% with every committed patch authored by the model", async () => {
    const accepted: string[] = [];
    const result = await selfHarness({
      agent: new DsAgent(),
      proposer: new ModelProposer(dsScriptedModel()),
      tasks: buildDsSuite(4),
      initialHarness: defaultHarness(),
    });
    for (const round of result.rounds) {
      if (round.acceptedPatchId) accepted.push(round.acceptedPatchId);
    }

    expect(result.finalPassRate).toBe(1);
    expect(result.finalHarness.rules).toEqual(expect.arrayContaining(Object.values(RULES)));
    expect(accepted.length).toBeGreaterThan(0);
    expect(accepted.every((id) => id.startsWith("model-patch"))).toBe(true);
  });
});
