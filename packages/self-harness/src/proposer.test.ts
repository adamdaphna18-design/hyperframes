import { describe, expect, it } from "vitest";
import { HeuristicProposer, ModelProposer, parseOps } from "./proposer.js";
import { ScriptedModel } from "./models/scripted.js";
import { defaultHarness } from "./harness.js";
import type { FailureCluster, SuiteResult } from "./types.js";

const emptySuite: SuiteResult = { results: [], passed: 0, failed: 0, passRate: 0 };
const cluster: FailureCluster = {
  pattern: "runaway-exploration",
  count: 2,
  taskIds: ["a", "b"],
  examples: ["a: explored forever"],
};

describe("HeuristicProposer", () => {
  it("offers an over-aggressive candidate before a sound one for runaway exploration", async () => {
    const proposer = new HeuristicProposer();
    const patches = await proposer.propose(defaultHarness(), cluster, emptySuite);
    expect(patches).toHaveLength(2);
    expect(patches[0]?.ops).toContainEqual({ op: "setLimit", key: "maxToolCalls", value: 3 });
    expect(patches[1]?.ops).toContainEqual({ op: "setLimit", key: "maxToolCalls", value: 50 });
  });

  it("returns no candidates for an unknown pattern", async () => {
    const proposer = new HeuristicProposer();
    const unknown: FailureCluster = { ...cluster, pattern: "mystery" };
    expect(await proposer.propose(defaultHarness(), unknown, emptySuite)).toEqual([]);
  });
});

describe("parseOps", () => {
  it("extracts a valid ops array embedded in prose", () => {
    const raw = 'Here is my fix:\n[{"op":"setLimit","key":"maxToolCalls","value":40}]\nDone.';
    expect(parseOps(raw)).toEqual([{ op: "setLimit", key: "maxToolCalls", value: 40 }]);
  });

  it("drops malformed ops but keeps valid ones", () => {
    const raw =
      '[{"op":"setLimit","key":"maxToolCalls","value":"nope"},{"op":"addRule","text":"ok"}]';
    expect(parseOps(raw)).toEqual([{ op: "addRule", text: "ok" }]);
  });

  it("returns [] on non-JSON", () => {
    expect(parseOps("I cannot help with that.")).toEqual([]);
  });
});

describe("ModelProposer", () => {
  it("turns a model's JSON response into a typed patch", async () => {
    const model = new ScriptedModel([
      {
        match: "runaway-exploration",
        reply: '[{"op":"setLimit","key":"maxToolCalls","value":50}]',
      },
    ]);
    const proposer = new ModelProposer(model);
    const patches = await proposer.propose(defaultHarness(), cluster, emptySuite);

    expect(patches).toHaveLength(1);
    expect(patches[0]?.ops).toEqual([{ op: "setLimit", key: "maxToolCalls", value: 50 }]);
    expect(patches[0]?.targetPattern).toBe("runaway-exploration");
  });

  it("yields no patch when the model returns nothing usable", async () => {
    const model = new ScriptedModel([], () => "no idea");
    const proposer = new ModelProposer(model);
    expect(await proposer.propose(defaultHarness(), cluster, emptySuite)).toEqual([]);
  });
});
