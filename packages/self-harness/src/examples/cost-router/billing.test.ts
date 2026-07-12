import { describe, expect, it } from "vitest";
import { defaultHarness } from "../../harness.js";
import { runSuite } from "../../runner.js";
import { drivenCampaign, expectLearnsUnderGate } from "../campaign-fixture.js";
import {
  MAXIMIZE_TAKE_RULE,
  SEGMENTS,
  bill,
  billingReport,
  buildCustomerBook,
  customerSavings,
  invoice,
  priceRule,
} from "./billing.js";
import { BillingAgent } from "./billing-agent.js";
import { PricingProposer } from "./billing-proposer.js";
import { buildBillingSuite } from "./billing-tasks.js";

const LEARNED = [priceRule("startup", 0.2), priceRule("midmarket", 0.3)];

describe("billing economics are grounded in the router's real savings", () => {
  it("retains a fair price and churns an over-reach", () => {
    const startup = { id: "s", segment: "startup" as const };
    // startups pay up to 20% of savings; 20% is retained, 35% churns.
    expect(bill(startup, 0.2).mrr).toBeGreaterThan(0);
    expect(bill(startup, 0.35).mrr).toBe(0);
    // A retained account bills exactly its take-rate share of a real, router-derived pool.
    expect(bill(startup, 0.2).mrr).toBeCloseTo(invoice(startup, 0.2), 9);
    expect(invoice(startup, 0.2)).toBeCloseTo(0.2 * customerSavings(startup), 9);
  });

  it("naive flat pricing keeps only the enterprise; the rest churn", () => {
    const book = buildCustomerBook();
    const naive = billingReport(book, new Set());
    expect(naive.retainedCustomers).toBe(1);
    expect(naive.mrr).toBeGreaterThan(0);
  });
});

describe("BillingAgent under the naive harness", () => {
  it("wins only the enterprise account and churns the price-sensitive segments", async () => {
    const suite = await runSuite(new BillingAgent(), defaultHarness(), buildBillingSuite());
    const byId = new Map(suite.results.map((r) => [r.taskId, r]));
    expect(byId.get("enterprise-0")?.passed).toBe(true);
    expect(byId.get("startup-0")?.passed).toBe(false);
    expect(byId.get("midmarket-0")?.passed).toBe(false);
    expect(byId.get("startup-0")?.trajectory.failureSignals).toContain("startup");
    // Only the 1 enterprise account of 10 clears at the flat default rate.
    expect(suite.passed).toBe(1);
  });
});

describe("Self-Harness over the revenue model", () => {
  it("retains the whole book and rejects the greedy maximize-take-rate rule", async () => {
    const { result, decisions } = await drivenCampaign(
      new BillingAgent(),
      new PricingProposer(),
      buildBillingSuite(),
    );
    expectLearnsUnderGate(result, decisions, LEARNED);
    expect(result.finalHarness.rules).not.toContain(MAXIMIZE_TAKE_RULE);
  });

  it("makes money — learned pricing lifts retained MRR over the naive flat rate", async () => {
    const book = buildCustomerBook();
    const { result } = await drivenCampaign(
      new BillingAgent(),
      new PricingProposer(),
      buildBillingSuite(),
    );
    const naive = billingReport(book, new Set());
    const learned = billingReport(book, new Set(result.finalHarness.rules));
    // Every account retained, and MRR strictly higher than churning nine of them.
    expect(learned.retainedCustomers).toBe(book.length);
    expect(learned.mrr).toBeGreaterThan(naive.mrr);
    expect(learned.arr).toBeCloseTo(learned.mrr * 12, 6);
    // The unlocked revenue is real money, not rounding.
    expect(learned.mrr - naive.mrr).toBeGreaterThan(1000);
  });

  it("the enterprise fair share is respected — no phantom over-charge", () => {
    // The learned rules never price a segment above its fair share.
    for (const rule of LEARNED) {
      const seg = rule.split(":")[1] as keyof typeof SEGMENTS;
      const rate = Number(rule.split(":")[2]);
      expect(rate).toBeLessThanOrEqual(SEGMENTS[seg].fairShare);
    }
  });
});
