import { describe, expect, it } from "vitest";
import { applyPatch, defaultHarness } from "../../harness.js";
import { runSuite } from "../../runner.js";
import { ModelProposer } from "../../proposer.js";
import { drivenCampaign, expectLearnsUnderGate } from "../campaign-fixture.js";
import { CAP_RULE, GOVERNANCE_RULE } from "./catalog.js";
import { FinfinAgent, paperBook, renderReasoning, type TradeResult } from "./finfin-agent.js";
import { finfinScriptedModel } from "./finfin-model.js";
import { FinfinHeuristicProposer } from "./finfin-proposer.js";
import { buildFinfinSuite } from "./tasks.js";

const agent = new FinfinAgent();

function parse(output: string): TradeResult {
  return JSON.parse(output) as TradeResult;
}

async function withRules(rules: string[]) {
  let h = defaultHarness();
  for (const text of rules)
    h = applyPatch(h, {
      id: text,
      targetPattern: "",
      rationale: "",
      ops: [{ op: "addRule", text }],
    });
  return runSuite(agent, h, buildFinfinSuite());
}

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

describe("execution + reasoning", () => {
  it("a governed healthy decision EXECUTES a $100 paper open and explains itself", async () => {
    const suite = await withRules([]); // healthy trades are governed under the default harness
    const healthy = suite.results.find((r) => r.taskId.startsWith("aligned"))!;
    const r = parse(healthy.trajectory.output);
    expect(r.action).toBe("TAKE");
    expect(r.paper?.notionalUsd).toBe(100); // 1% of the $10k sleeve
    expect(r.rationale).toContain("EXECUTE");
    expect(r.rationale).toContain("all confirm");
    expect(renderReasoning(healthy.trajectory)).toContain("[TAKE ]");
  });

  it("the NAIVE harness commits the mistake — it TAKES the bad trade", async () => {
    const suite = await withRules([]); // no regime rail
    const regime = suite.results.find((r) => r.taskId.startsWith("trade-against-regime"))!;
    const r = parse(regime.trajectory.output);
    expect(r.governed).toBe(false); // it's a failure
    expect(r.action).toBe("TAKE"); // ...because it TOOK the trade it shouldn't
    expect(r.paper).toBeDefined();
    expect(r.rationale).toContain("mistake");
  });

  it("the veto rail makes it STAND ASIDE — no paper trade — the governed outcome", async () => {
    const suite = await withRules([GOVERNANCE_RULE["trade-against-regime"]]);
    const regime = suite.results.find((r) => r.taskId.startsWith("trade-against-regime"))!;
    const r = parse(regime.trajectory.output);
    expect(r.governed).toBe(true); // standing aside IS governed
    expect(r.action).toBe("STAND_ASIDE");
    expect(r.paper).toBeUndefined();
    expect(r.rationale).toContain("STAND ASIDE");
  });

  it("the risk-budget rail SIZES the oversized trade down, not just gates it", async () => {
    const suite = await withRules([CAP_RULE]);
    const over = suite.results.find((r) => r.taskId.startsWith("oversized-position"))!;
    const r = parse(over.trajectory.output);
    expect(r.action).toBe("TAKE");
    expect(r.paper?.sizeFraction).toBe(0.01);
    expect(r.paper?.notionalUsd).toBe(100);
    expect(r.rationale).toContain("capped");
  });

  it("paperBook holds only the trades that SHOULD execute — vetoes are absent", async () => {
    // all rails present: 3 healthy + oversized(capped) + pairs(corrected) execute; regime/chase/rug veto
    const suite = await withRules(Object.values(GOVERNANCE_RULE));
    const trades = paperBook(suite.results.map((r) => r.trajectory));
    expect(trades.length).toBe(5); // 8 decisions − 3 vetoed
    const total = trades.reduce((s, t) => s + t.notionalUsd, 0);
    expect(total).toBe(500); // 5 × $100 (oversized capped to $100)
    expect(trades.some((t) => t.taskId.startsWith("trade-against-regime"))).toBe(false); // vetoed, not booked
  });
});
