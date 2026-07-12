import { describe, expect, it } from "vitest";
import { applyPatch, defaultHarness } from "../../harness.js";
import { regressionGate } from "../../gate.js";
import { runSuite } from "../../runner.js";
import { drivenCampaign, expectLearnsUnderGate } from "../campaign-fixture.js";
import { GUARDRAIL_RULE, OVERBROAD_FREEZE_RULE } from "./catalog.js";
import { PmAgent } from "./pm-agent.js";
import { PmHeuristicProposer } from "./pm-proposer.js";
import { buildPmSuite } from "./tasks.js";

const agent = new PmAgent();

describe("PmAgent under the naive harness", () => {
  it("commits each fundamental-feature violation with its signal; healthy actions pass", async () => {
    const suite = await runSuite(agent, defaultHarness(), buildPmSuite());
    const byId = new Map(suite.results.map((r) => [r.taskId, r]));
    const signal = (id: string) => byId.get(id)?.trajectory.failureSignals ?? [];

    // Healthy, in-cap, grounded, approved, logged actions pass from the start.
    expect(byId.get("budget-change-cut-adset-a-10pct-on-roas-drop")?.passed).toBe(true);
    expect(byId.get("budget-change-scale-winner-8pct-on-real-win")?.passed).toBe(true);

    // Each fundamental feature trips its own guardrail until it is learned.
    expect(signal("budget-change-raise-adset-a-40pct")).toContain("overspend");
    expect(signal("recommendation-rotate-to-angle-12")).toContain("ungrounded");
    expect(signal("execution-execute-budget-cut")).toContain("self-approve");
    expect(signal("triggering-nudge-idle-campaign")).toContain("no-trigger");
    expect(signal("accountability-silent-budget-tweak")).toContain("unlogged");
  });
});

describe("the over-broad freeze is a real regression the gate must catch", () => {
  it("freezing all budget changes regresses the legitimate in-cap actions", async () => {
    const baseline = await runSuite(agent, defaultHarness(), buildPmSuite());
    const freeze = {
      id: "freeze",
      targetPattern: "overspend",
      rationale: "freeze everything",
      ops: [{ op: "addRule", text: OVERBROAD_FREEZE_RULE }] as const,
    };
    const frozen = applyPatch(defaultHarness(), { ...freeze, ops: [...freeze.ops] });
    const after = await runSuite(agent, frozen, buildPmSuite());

    // The healthy budget actions passed before and fail under the freeze.
    const before = new Set(baseline.results.filter((r) => r.passed).map((r) => r.taskId));
    const nowFailing = after.results.filter((r) => !r.passed).map((r) => r.taskId);
    expect(nowFailing).toContain("budget-change-cut-adset-a-10pct-on-roas-drop");
    expect(before.has("budget-change-cut-adset-a-10pct-on-roas-drop")).toBe(true);
  });

  it("regressionGate rejects the freeze but accepts the daily cap", async () => {
    const tasks = buildPmSuite();
    const baseline = await runSuite(agent, defaultHarness(), tasks);
    const mk = (text: string) => ({
      id: text,
      targetPattern: "overspend",
      rationale: text,
      ops: [{ op: "addRule" as const, text }],
    });

    const freezeDecision = await regressionGate(
      agent,
      defaultHarness(),
      mk(OVERBROAD_FREEZE_RULE),
      tasks,
      baseline,
    );
    expect(freezeDecision.accepted).toBe(false);
    expect(freezeDecision.regressions.length).toBeGreaterThan(0);

    const capDecision = await regressionGate(
      agent,
      defaultHarness(),
      mk(GUARDRAIL_RULE.overspend),
      tasks,
      baseline,
    );
    expect(capDecision.accepted).toBe(true);
    expect(capDecision.newlyPassing).toContain("budget-change-raise-adset-a-40pct");
  });
});

describe("selfHarness over the ad-budget suite", () => {
  it("reaches 100% safe action and learns every fundamental-feature guardrail", async () => {
    const { result, decisions } = await drivenCampaign(
      agent,
      new PmHeuristicProposer(),
      buildPmSuite(),
    );
    expectLearnsUnderGate(result, decisions, [
      GUARDRAIL_RULE.overspend,
      GUARDRAIL_RULE.ungrounded,
      GUARDRAIL_RULE["self-approve"],
      GUARDRAIL_RULE["no-trigger"],
      GUARDRAIL_RULE.unlogged,
    ]);
    // The blanket freeze never survives into the final harness.
    expect(result.finalHarness.rules).not.toContain(OVERBROAD_FREEZE_RULE);
  });
});
