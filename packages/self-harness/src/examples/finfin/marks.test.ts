import { describe, expect, it } from "vitest";
import { applyPatch, defaultHarness } from "../../harness.js";
import { runSuite } from "../../runner.js";
import { GOVERNANCE_RULE } from "./catalog.js";
import { FinfinAgent, paperBook, type PaperTrade, type TradeResult } from "./finfin-agent.js";
import { LIVE_PRICES } from "./marks-fixture.js";
import { markBook, markTrade, type PriceMap } from "./marks.js";
import { buildFinfinSuite } from "./tasks.js";

const trade = (over: Partial<PaperTrade> = {}): PaperTrade => ({
  taskId: "t",
  setup: "s",
  ticker: "NVDA",
  direction: "LONG",
  sizeFraction: 0.01,
  notionalUsd: 100,
  ...over,
});

describe("markTrade", () => {
  it("computes P&L from entry → mark for a LONG", () => {
    const prices: PriceMap = { NVDA: { entry: 100, mark: 110 } };
    const m = markTrade(trade(), prices)!;
    expect(m.returnPct).toBe(0.1);
    expect(m.pnlUsd).toBe(10); // +10% of $100
  });

  it("flips the sign for a SHORT", () => {
    const prices: PriceMap = { WULF: { entry: 100, mark: 90 } };
    const m = markTrade(trade({ ticker: "WULF", direction: "SHORT" }), prices)!;
    expect(m.pnlUsd).toBe(10); // short a −10% move = +$10
  });

  it("returns null for an unpriced instrument (never guesses)", () => {
    expect(markTrade(trade({ ticker: "ZZZZ" }), {})).toBeNull();
  });
});

describe("markBook on real captured prices", () => {
  it("marks the executed governed book to a real P&L", async () => {
    let h = defaultHarness();
    for (const text of Object.values(GOVERNANCE_RULE)) {
      h = applyPatch(h, {
        id: text,
        targetPattern: "",
        rationale: "",
        ops: [{ op: "addRule", text }],
      });
    }
    const suite = await runSuite(new FinfinAgent(), h, buildFinfinSuite());
    const book = paperBook(suite.results.map((r) => r.trajectory));
    const pnl = markBook(book, LIVE_PRICES);

    expect(pnl.marked.length).toBe(5); // the 5 executed trades (3 vetoed are not booked)
    expect(pnl.totalNotional).toBe(500);
    expect(pnl.unpriced).toEqual([]);
    // NVDA +4% ≈ +$4.03 is the single biggest contributor; the book nets positive on these real marks
    const nvda = pnl.marked.find((m) => m.ticker === "NVDA")!;
    expect(nvda.pnlUsd).toBeGreaterThan(3);
    expect(pnl.totalPnlUsd).toBeCloseTo(1.89, 1);
  });

  it("the regime veto avoided WULF's real loss", async () => {
    let h = defaultHarness();
    h = applyPatch(h, {
      id: "r",
      targetPattern: "",
      rationale: "",
      ops: [{ op: "addRule", text: GOVERNANCE_RULE["trade-against-regime"] }],
    });
    const suite = await runSuite(new FinfinAgent(), h, buildFinfinSuite());
    const regime = suite.results.find((r) => r.taskId.startsWith("trade-against-regime"))!;
    const r = JSON.parse(regime.trajectory.output) as TradeResult;
    expect(r.action).toBe("STAND_ASIDE");
    expect(r.declined).toBeDefined();
    // the declined WULF long would have lost money on the real snapshot
    const avoided = markTrade(r.declined!, LIVE_PRICES)!;
    expect(avoided.pnlUsd).toBeLessThan(-4); // ≈ −$5.30 avoided
  });
});
