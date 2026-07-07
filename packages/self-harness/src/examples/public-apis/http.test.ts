import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { runSuite } from "../../runner.js";
import { HttpAgent } from "./http-agent.js";
import { HttpHeuristicProposer } from "./http-proposer.js";
import { buildPublicApiSuite } from "./tasks.js";
import { runPublicApiDemo } from "./run.js";

const agent = new HttpAgent();

describe("HttpAgent under the naive harness", () => {
  it("passes fast endpoints and fails each pathology with the right signal", async () => {
    const suite = await runSuite(agent, defaultHarness(), buildPublicApiSuite());
    const byId = new Map(suite.results.map((r) => [r.taskId, r]));

    expect(byId.get("cat-facts")?.passed).toBe(true);
    expect(byId.get("rest-countries")?.passed).toBe(true); // paged, but budget is ample

    const signalsOf = (id: string) => byId.get(id)?.trajectory.failureSignals ?? [];
    expect(signalsOf("agify")).toContain("request-timeout");
    expect(signalsOf("dog-ceo")).toContain("http-429-no-retry");
    expect(signalsOf("ipify")).toContain("redirect-not-followed");
  });
});

describe("public-apis Self-Harness loop", () => {
  it("tunes the harness from partial to full pass rate", async () => {
    const result = await selfHarness({
      agent,
      proposer: new HttpHeuristicProposer(),
      tasks: buildPublicApiSuite(),
      initialHarness: defaultHarness(),
    });

    expect(result.initialPassRate).toBeLessThan(0.5);
    expect(result.finalPassRate).toBe(1);

    // The learned fingerprint: the three HTTP fixes, as rules.
    expect(result.finalHarness.rules).toContain("timeout-ms=2000");
    expect(result.finalHarness.rules).toContain("retry-on-429");
    expect(result.finalHarness.rules).toContain("follow-redirects");
    // The over-aggressive maxToolCalls=1 candidate was rejected, so the budget
    // that the paged endpoint depends on survives.
    expect(result.finalHarness.limits.maxToolCalls).toBe(1000);
  });

  it("rejects at least one candidate at the gate before converging", async () => {
    const decisions: boolean[] = [];
    await selfHarness({
      agent,
      proposer: new HttpHeuristicProposer(),
      tasks: buildPublicApiSuite(),
      initialHarness: defaultHarness(),
      onEvent: (e) => {
        if (e.type === "gate") decisions.push(e.decision.accepted);
      },
    });
    expect(decisions).toContain(false);
    expect(decisions).toContain(true);
  });
});

describe("demo entry point", () => {
  afterEach(() => vi.restoreAllMocks());
  it("runs offline without throwing", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await expect(runPublicApiDemo()).resolves.toBeUndefined();
  });
});
