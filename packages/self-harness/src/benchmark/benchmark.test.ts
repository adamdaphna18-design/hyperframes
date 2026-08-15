import { describe, expect, it } from "vitest";
import { defaultHarness } from "../harness.js";
import { TaAgent } from "../examples/technical-analysis/ta-agent.js";
import { TaProposer } from "../examples/technical-analysis/ta-proposer.js";
import { buildTaSuite } from "../examples/technical-analysis/tasks.js";
import { accepts, runWithPolicy, type AcceptancePolicy } from "./policy-loop.js";
import { buildSyntheticCampaign, type SyntheticConfig } from "./synthetic.js";

const CFG: SyntheticConfig = {
  broken: 6,
  protectedTasks: 4,
  sideEffectProb: 0.25,
  bundleProb: 0.25,
  coupledProb: 0.15,
};

async function sweep(policy: AcceptancePolicy, seeds: number): Promise<number> {
  let regressions = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const { agent, proposer, tasks } = buildSyntheticCampaign(seed, CFG);
    const r = await runWithPolicy({
      agent,
      proposer,
      tasks,
      initialHarness: defaultHarness(),
      policy,
    });
    regressions += r.regressions;
  }
  return regressions;
}

describe("the acceptance-policy predicate", () => {
  it("encodes the three market philosophies", () => {
    // gated: fixes something, breaks nothing.
    expect(accepts("gated", { newlyPassing: 2, regressions: 0, index: 0 })).toBe(true);
    expect(accepts("gated", { newlyPassing: 2, regressions: 1, index: 0 })).toBe(false);
    // net-positive: fixes more than it breaks — accepts a net win that still regresses.
    expect(accepts("net-positive", { newlyPassing: 2, regressions: 1, index: 0 })).toBe(true);
    expect(accepts("net-positive", { newlyPassing: 1, regressions: 1, index: 0 })).toBe(false);
    // greedy-first: takes the first candidate that changes anything.
    expect(accepts("greedy-first", { newlyPassing: 1, regressions: 3, index: 0 })).toBe(true);
    expect(accepts("greedy-first", { newlyPassing: 1, regressions: 0, index: 1 })).toBe(false);
  });
});

describe("gate vs the market at scale (synthetic)", () => {
  it("only the gate introduces zero regressions across the sweep", async () => {
    const seeds = 60;
    const gated = await sweep("gated", seeds);
    const netPositive = await sweep("net-positive", seeds);
    const greedy = await sweep("greedy-first", seeds);
    expect(gated).toBe(0);
    expect(netPositive).toBeGreaterThan(0);
    expect(greedy).toBeGreaterThan(netPositive); // naive greedy is the most destructive
  });

  it("is deterministic — same seed and policy give the same outcome", async () => {
    const build = () => buildSyntheticCampaign(42, CFG);
    const a = await runWithPolicy({
      ...build(),
      initialHarness: defaultHarness(),
      policy: "net-positive",
    });
    const b = await runWithPolicy({
      ...build(),
      initialHarness: defaultHarness(),
      policy: "net-positive",
    });
    expect(a).toEqual(b);
  });
});

describe("gate vs the market on a real product campaign", () => {
  it("only the gate reaches 100% with no regression on technical-analysis", async () => {
    const gate = await runWithPolicy({
      agent: new TaAgent(),
      proposer: new TaProposer(),
      tasks: buildTaSuite(),
      initialHarness: defaultHarness(),
      policy: "gated",
    });
    expect(gate.regressions).toBe(0);
    expect(gate.finalPassRate).toBe(1);

    const greedy = await runWithPolicy({
      agent: new TaAgent(),
      proposer: new TaProposer(),
      tasks: buildTaSuite(),
      initialHarness: defaultHarness(),
      policy: "greedy-first",
    });
    // The naive self-healer takes the chase-momentum fix and breaks a working call.
    expect(greedy.regressions).toBeGreaterThan(0);
  });
});
