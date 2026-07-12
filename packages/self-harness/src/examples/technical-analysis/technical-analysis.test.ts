import { describe, expect, it } from "vitest";
import { defaultHarness } from "../../harness.js";
import { runSuite } from "../../runner.js";
import { drivenCampaign, expectLearnsUnderGate } from "../campaign-fixture.js";
import { bollinger, ema, macd, rsi, sma } from "./indicators.js";
import { AAPL_CLOSES } from "./prices.js";
import { HARMFUL_RULE, RULE_FOR_PATTERN, SCENARIOS } from "./scenarios.js";
import { TaAgent } from "./ta-agent.js";
import { TaProposer } from "./ta-proposer.js";
import { buildTaSuite } from "./tasks.js";

describe("indicators are computed correctly", () => {
  it("matches known values on simple series", () => {
    expect(sma([2, 4, 6], 3)).toBe(4);
    expect(sma([1, 2, 3, 4, 5], 2)).toBe(4.5);
    expect(ema([5, 5, 5, 5], 3)).toBe(5); // EMA of a constant is the constant
    expect(rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])).toBe(100); // all gains
    expect(rsi([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1])).toBe(0); // all losses
    const flat = Array(25).fill(10);
    expect(macd(flat).histogram).toBeCloseTo(0, 6);
    const b = bollinger(Array(20).fill(10));
    expect(b.upper).toBe(10);
    expect(b.lower).toBe(10);
  });

  it("reproduces the reference reading on the real AAPL data", () => {
    // idx 367 is overbought under the module's Wilder RSI (~72.9).
    const window = AAPL_CLOSES.slice(0, 368);
    expect(rsi(window)).toBeGreaterThan(72);
    expect(rsi(window)).toBeLessThan(74);
  });
});

describe("scenarios are grounded in real indicator readings", () => {
  it("each labeled pattern actually shows in the real window", () => {
    const byId = new Map(SCENARIOS.map((s) => [s.id, s]));
    expect(rsi(byId.get("overbought-367")?.window ?? [])).toBeGreaterThan(70);
    expect(macd(byId.get("macd-62")?.window ?? []).histogram).toBeGreaterThan(0);
    const gc = byId.get("golden-cross-391")?.window ?? [];
    expect(sma(gc, 50)).toBeGreaterThan(sma(gc, 200));
    const bb = byId.get("bollinger-106")?.window ?? [];
    expect(bb.at(-1)).toBeGreaterThan(bollinger(bb).upper);
  });
});

describe("TaAgent under the naive harness", () => {
  it("gets neutral setups right and every actionable one wrong", async () => {
    const suite = await runSuite(new TaAgent(), defaultHarness(), buildTaSuite());
    const byId = new Map(suite.results.map((r) => [r.taskId, r]));
    expect(byId.get("neutral-40")?.passed).toBe(true);
    expect(byId.get("overbought-276")?.passed).toBe(false);
    expect(byId.get("macd-62")?.passed).toBe(false);
    expect(byId.get("golden-cross-391")?.trajectory.failureSignals).toContain("golden-cross");
  });
});

describe("Self-Harness over the trading scenarios", () => {
  it("reaches 100% and rejects the chase-momentum rule that buys overbought setups", async () => {
    const learned = Object.values(RULE_FOR_PATTERN);
    const { result, decisions } = await drivenCampaign(
      new TaAgent(),
      new TaProposer(),
      buildTaSuite(),
    );
    expectLearnsUnderGate(result, decisions, learned);
    // The over-aggressive momentum rule was never committed.
    expect(result.finalHarness.rules).not.toContain(HARMFUL_RULE);
    // Every learned rule is an indicator rule (sanity on the fingerprint).
    for (const rule of result.finalHarness.rules) {
      expect(Object.values(RULE_FOR_PATTERN)).toContain(rule);
    }
  });
});
