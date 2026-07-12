import { describe, expect, it } from "vitest";
import { defaultHarness } from "../../harness.js";
import { runSuite } from "../../runner.js";
import { ModelProposer } from "../../proposer.js";
import { drivenCampaign, expectLearnsUnderGate } from "../campaign-fixture.js";
import { GOVERNANCE_RULE } from "./catalog.js";
import { FinfinAgent } from "./finfin-agent.js";
import { finfinScriptedModel } from "./finfin-model.js";
import { FinfinHeuristicProposer } from "./finfin-proposer.js";
import { buildFinfinSuite } from "./tasks.js";

const agent = new FinfinAgent();

describe("FinfinAgent under the naive harness", () => {
  it("breaches each governance rail with its signal until the rule is learned", async () => {
    const suite = await runSuite(agent, defaultHarness(), buildFinfinSuite());
    const byId = new Map(suite.results.map((r) => [r.taskId, r]));
    const signal = (id: string) =>
      [...byId.entries()].find(([k]) => k.includes(id))?.[1].trajectory.failureSignals ?? [];

    // healthy trades pass from the start (the gate has something to protect)
    const healthy = suite.results.filter((r) => r.taskId.startsWith("aligned"));
    expect(healthy.length).toBe(3);
    expect(healthy.every((r) => r.passed)).toBe(true);

    // each pathology breaches with its own signal under the naive harness
    expect(signal("trade-against-regime")).toContain("trade-against-regime");
    expect(signal("oversized-position")).toContain("oversized-position");
    expect(signal("chased-extended-entry")).toContain("chased-extended-entry");
    expect(signal("unverified-rug")).toContain("unverified-rug");
    expect(signal("pairs-on-returns")).toContain("pairs-on-returns");
  });

  it("starts below full pass because the governance rules are missing", async () => {
    const suite = await runSuite(agent, defaultHarness(), buildFinfinSuite());
    const passing = suite.results.filter((r) => r.passed).length;
    expect(passing).toBe(3); // only the healthy trades
  });
});

describe("selfHarness over the finfin decision suite", () => {
  it("reaches 100% governed and rejects the halt-all-trading throttle", async () => {
    // The over-broad maxToolCalls=1 "halt trading" fix is rejected (it starves the
    // confirmation-heavy healthy trades), so the budget survives (maxToolCalls stays 1000)
    // and the loop instead learns the minimal governance rule for each pathology.
    const { result, decisions } = await drivenCampaign(
      agent,
      new FinfinHeuristicProposer(),
      buildFinfinSuite(),
    );
    expectLearnsUnderGate(result, decisions, Object.values(GOVERNANCE_RULE));
  });

  it("learns the same rails when a (scripted) model authors the edits", async () => {
    const { result } = await drivenCampaign(
      agent,
      new ModelProposer(finfinScriptedModel()),
      buildFinfinSuite(),
    );
    expect(result.finalPassRate).toBe(1);
    expect(result.finalHarness.rules).toEqual(
      expect.arrayContaining([GOVERNANCE_RULE["trade-against-regime"]]),
    );
  });
});
