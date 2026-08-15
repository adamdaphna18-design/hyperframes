import { describe, expect, it } from "vitest";
import { SAMPLE_SERVERS } from "./sample-manifests.js";
import { ecosystemReport, scoreServer, type ServerManifest } from "./scorecard.js";

const CLEAN: ServerManifest = {
  name: "clean",
  declaresRateLimits: true,
  tools: [{ name: "user.get", args: [{ name: "userId", type: "string", constrained: true }] }],
};

const DANGEROUS: ServerManifest = {
  name: "dangerous",
  declaresRateLimits: false,
  tools: [
    {
      name: "charge.create",
      args: [{ name: "amount", type: "string" }],
      mutation: true,
      idempotent: false,
    },
  ],
};

describe("the reliability scan grades a manifest", () => {
  it("gives a well-built server an A with no findings", () => {
    const card = scoreServer(CLEAN);
    expect(card.grade).toBe("A");
    expect(card.findings).toHaveLength(0);
  });

  it("flags a non-idempotent mutation as the high-weight unsafe-retry risk", () => {
    const card = scoreServer(DANGEROUS);
    const kinds = card.findings.map((f) => f.risk);
    expect(kinds).toContain("unsafe-retry");
    expect(kinds).toContain("rate-limit"); // no documented limits
    expect(kinds).toContain("format-ambiguity"); // unconstrained 'amount'
    // unsafe-retry (5) + rate-limit (1) + format-ambiguity (1) = 7 → D.
    expect(card.risk).toBe(7);
    expect(card.grade).toBe("D");
  });

  it("an idempotent mutation carries no unsafe-retry risk", () => {
    const idempotent: ServerManifest = {
      name: "safe-write",
      declaresRateLimits: true,
      tools: [
        {
          name: "order.refund",
          args: [{ name: "orderId", type: "string", constrained: true }],
          mutation: true,
          idempotent: true,
        },
      ],
    };
    expect(scoreServer(idempotent).findings).toHaveLength(0);
  });
});

describe("the ecosystem report is the content asset and the lead list", () => {
  it("counts the servers carrying each risk across the sample", () => {
    const cards = SAMPLE_SERVERS.map(scoreServer);
    const report = ecosystemReport(cards);
    expect(report.servers).toBe(SAMPLE_SERVERS.length);
    // crm-mcp and payments-mcp both ship a non-idempotent mutation.
    expect(report.withUnsafeRetry).toBe(2);
    // Every server lands in exactly one grade bucket.
    const bucketed = (["A", "B", "C", "D", "F"] as const).reduce(
      (n, g) => n + report.gradeDistribution[g],
      0,
    );
    expect(bucketed).toBe(SAMPLE_SERVERS.length);
    expect(report.averageRisk).toBeGreaterThan(0);
  });
});
