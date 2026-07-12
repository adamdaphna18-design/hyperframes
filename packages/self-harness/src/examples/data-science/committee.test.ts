import { describe, expect, it } from "vitest";
import { defaultHarness } from "../../harness.js";
import { runSuite } from "../../runner.js";
import type { HarnessPatch } from "../../types.js";
import { drivenCampaign } from "../campaign-fixture.js";
import {
  ArchitectJudge,
  CommitteeProposer,
  EconomistJudge,
  EmpiricalJudge,
  type JudgeContext,
} from "./committee.js";
import { DsAgent } from "./ds-agent.js";
import { DsHeuristicProposer } from "./ds-proposer.js";
import { buildDsSuite } from "./tasks.js";

const rulePatch: HarnessPatch = {
  id: "rule",
  targetPattern: "data-leakage",
  rationale: "",
  ops: [{ op: "addRule", text: "fit-transforms-on-train-only" }],
};

const clampPatch: HarnessPatch = {
  id: "clamp",
  targetPattern: "runaway-training",
  rationale: "",
  ops: [{ op: "setLimit", key: "maxToolCalls", value: 3 }],
};

async function context(): Promise<JudgeContext> {
  const agent = new DsAgent();
  const tasks = buildDsSuite(4);
  const baseline = await runSuite(agent, defaultHarness(), tasks);
  return { harness: defaultHarness(), agent, tasks, baseline };
}

describe("EmpiricalJudge (SR-Scientist)", () => {
  it("passes an edit proven to improve results with no regression", async () => {
    const judge = new EmpiricalJudge();
    const v = await judge.evaluate(rulePatch, await context());
    expect(v.veto).toBe(false);
    expect(v.score).toBeGreaterThan(5);
  });

  it("vetoes an edit that regresses passing projects", async () => {
    const judge = new EmpiricalJudge();
    const v = await judge.evaluate(clampPatch, await context());
    expect(v.veto).toBe(true);
    expect(v.score).toBe(0);
    expect(v.rationale).toContain("regress");
  });
});

describe("ArchitectJudge and EconomistJudge", () => {
  it("architect vetoes a tight compute clamp but rewards a declarative rule", async () => {
    const architect = new ArchitectJudge();
    expect((await architect.evaluate(clampPatch)).veto).toBe(true);
    expect((await architect.evaluate(rulePatch)).score).toBeGreaterThanOrEqual(9);
  });

  it("economist finds a clamp cheap and a rule costless — the Pareto tension", async () => {
    const economist = new EconomistJudge();
    // The economist likes the clamp the architect vetoes.
    expect((await economist.evaluate(clampPatch)).veto).toBe(false);
    expect((await economist.evaluate(rulePatch)).score).toBeGreaterThan(0);
  });
});

describe("CommitteeProposer", () => {
  it("filters candidates through the committee and still reaches 100%", async () => {
    const agent = new DsAgent();
    const tasks = buildDsSuite(4);
    const committee = new CommitteeProposer({ inner: new DsHeuristicProposer(), agent, tasks });

    const { result } = await drivenCampaign(agent, committee, tasks);

    expect(result.finalPassRate).toBe(1);
    // The aggressive runaway-training clamp was reviewed and vetoed.
    const vetoed = committee.courtRecords().find((r) => r.vetoed);
    expect(vetoed?.targetPattern).toBe("runaway-training");
    expect(vetoed?.verdicts.some((v) => v.judge.includes("SR-Scientist") && v.veto)).toBe(true);
    // Every accepted record cleared the threshold with no veto.
    for (const record of committee.courtRecords()) {
      if (record.accepted) expect(record.vetoed).toBe(false);
    }
  });
});
