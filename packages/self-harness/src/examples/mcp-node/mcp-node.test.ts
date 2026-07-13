import { describe, expect, it } from "vitest";
import { defaultHarness } from "../../harness.js";
import { runSuite } from "../../runner.js";
import { drivenCampaign, expectLearnsUnderGate } from "../campaign-fixture.js";
import { McpNode } from "./node-agent.js";
import { RepairProposer } from "./node-proposer.js";
import { RETRY_ALL_RULE, RULE_FOR_FAILURE } from "./rules.js";
import { buildMcpSuite } from "./tasks.js";
import { callTool, getTool } from "./tools.js";

const LEARNED = Object.values(RULE_FOR_FAILURE);

describe("the tools validate payloads for real", () => {
  it("fails drift, bad format, and rate limit; passes a clean call", () => {
    expect(callTool(getTool("users.get"), { user: "u1" }, { backoff: false }).ok).toBe(false);
    expect(callTool(getTool("users.get"), { userId: "u1" }, { backoff: false }).ok).toBe(true);
    expect(callTool(getTool("events.create"), { date: "2020/01/05" }, { backoff: false }).ok).toBe(
      false,
    );
    expect(callTool(getTool("events.create"), { date: "2020-01-05" }, { backoff: false }).ok).toBe(
      true,
    );
    expect(callTool(getTool("orders.search"), { q: "x" }, { backoff: false }).ok).toBe(false);
    expect(callTool(getTool("orders.search"), { q: "x" }, { backoff: true }).ok).toBe(true);
  });
});

describe("McpNode under the naive harness", () => {
  it("breaks on the messy calls and keeps the clean ones (incl. the charge)", async () => {
    const suite = await runSuite(new McpNode(), defaultHarness(), buildMcpSuite());
    const byId = new Map(suite.results.map((r) => [r.taskId, r]));
    expect(byId.get("drift-1")?.passed).toBe(false);
    expect(byId.get("fmt-1")?.passed).toBe(false);
    expect(byId.get("rate-1")?.passed).toBe(false);
    expect(byId.get("clean-user")?.passed).toBe(true);
    expect(byId.get("charge-guard")?.passed).toBe(true);
    expect(byId.get("drift-1")?.trajectory.failureSignals).toContain("schema-drift");
    // The 3 already-correct calls pass; the 6 messy ones fail.
    expect(suite.passed).toBe(3);
  });
});

describe("Self-Harness over the MCP node", () => {
  it("learns every repair and rejects the retry:all that double-charges", async () => {
    const { result, decisions } = await drivenCampaign(
      new McpNode(),
      new RepairProposer(),
      buildMcpSuite(),
    );
    expectLearnsUnderGate(result, decisions, LEARNED);
    expect(result.finalHarness.rules).not.toContain(RETRY_ALL_RULE);
  });

  it("the charge is never double-executed under the final harness", async () => {
    const { result } = await drivenCampaign(new McpNode(), new RepairProposer(), buildMcpSuite());
    const suite = await runSuite(new McpNode(), result.finalHarness, buildMcpSuite());
    const charge = suite.results.find((r) => r.taskId === "charge-guard");
    expect(charge?.passed).toBe(true);
    expect(charge?.trajectory.output).toContain('"executions":1');
  });
});
