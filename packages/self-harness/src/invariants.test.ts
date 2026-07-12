import { describe, expect, it } from "vitest";
import { drivenCampaign } from "./examples/campaign-fixture.js";
import { buildDemoBrain } from "./examples/company-brain/fixture.js";
import { CompanyAgent } from "./examples/company-brain/os-agent.js";
import { CompanyPlaybookProposer } from "./examples/company-brain/os-proposer.js";
import { buildCompanySuite } from "./examples/company-brain/tasks.js";
import { DsAgent } from "./examples/data-science/ds-agent.js";
import { DsHeuristicProposer } from "./examples/data-science/ds-proposer.js";
import { buildDsSuite } from "./examples/data-science/tasks.js";
import { OsintAgent } from "./examples/osint/osint-agent.js";
import { OsintHeuristicProposer } from "./examples/osint/osint-proposer.js";
import { buildOsintSuite } from "./examples/osint/tasks.js";
import { Router } from "./examples/router/router-agent.js";
import { RouterProposer } from "./examples/router/router-proposer.js";
import { buildRouterSuite } from "./examples/router/tasks.js";
import { TaAgent } from "./examples/technical-analysis/ta-agent.js";
import { TaProposer } from "./examples/technical-analysis/ta-proposer.js";
import { buildTaSuite } from "./examples/technical-analysis/tasks.js";
import { CostProposer } from "./examples/cost-router/cost-proposer.js";
import { CostRouter } from "./examples/cost-router/router-agent.js";
import { buildCostSuite } from "./examples/cost-router/tasks.js";
import { BillingAgent } from "./examples/cost-router/billing-agent.js";
import { PricingProposer } from "./examples/cost-router/billing-proposer.js";
import { buildBillingSuite } from "./examples/cost-router/billing-tasks.js";
import { defaultHarness } from "./harness.js";
import { selfHarness, type SelfHarnessResult } from "./loop.js";
import { passingIds, runSuite } from "./runner.js";
import type { Agent, Proposer, Task } from "./types.js";

/**
 * The deep guarantees, proven across every real example at once. Each campaign
 * has a deliberately over-aggressive candidate (a compute clamp, a throttle, a
 * keyword-stuffing rule) so the gate is genuinely exercised — and every campaign
 * must still satisfy all four invariants below.
 */
interface Campaign {
  name: string;
  make: () => { agent: Agent; proposer: Proposer; tasks: Task[] };
}

const CAMPAIGNS: Campaign[] = [
  {
    name: "data-science",
    make: () => ({
      agent: new DsAgent(),
      proposer: new DsHeuristicProposer(),
      tasks: buildDsSuite(4),
    }),
  },
  {
    name: "osint",
    make: () => ({
      agent: new OsintAgent(),
      proposer: new OsintHeuristicProposer(),
      tasks: buildOsintSuite(),
    }),
  },
  {
    name: "company-brain",
    make: () => ({
      agent: new CompanyAgent(buildDemoBrain()),
      proposer: new CompanyPlaybookProposer(),
      tasks: buildCompanySuite(),
    }),
  },
  {
    name: "router",
    make: () => ({
      agent: new Router(),
      proposer: new RouterProposer(),
      tasks: buildRouterSuite(),
    }),
  },
  {
    name: "technical-analysis",
    make: () => ({ agent: new TaAgent(), proposer: new TaProposer(), tasks: buildTaSuite() }),
  },
  {
    name: "cost-router",
    make: () => ({
      agent: new CostRouter(),
      proposer: new CostProposer(),
      tasks: buildCostSuite(),
    }),
  },
  {
    name: "billing",
    make: () => ({
      agent: new BillingAgent(),
      proposer: new PricingProposer(),
      tasks: buildBillingSuite(),
    }),
  },
];

async function converge(
  c: Campaign,
): Promise<{ agent: Agent; tasks: Task[]; result: SelfHarnessResult }> {
  const { agent, proposer, tasks } = c.make();
  const result = await selfHarness({ agent, proposer, tasks, initialHarness: defaultHarness() });
  return { agent, tasks, result };
}

describe("cross-example invariants", () => {
  for (const c of CAMPAIGNS) {
    describe(c.name, () => {
      it("monotonic progress — the passing set never shrinks across rounds (no collapse)", async () => {
        const { result } = await converge(c);
        let prev = new Set<string>();
        for (const round of result.rounds) {
          const now = passingIds(round.before);
          for (const id of prev) expect(now.has(id)).toBe(true);
          prev = now;
        }
        expect(result.finalPassRate).toBe(1);
      });

      it("minimal harness — every committed rule is load-bearing, no clamp survived", async () => {
        const { agent, tasks, result } = await converge(c);
        // The gate rejected every over-aggressive candidate, so no limit was ever committed.
        expect(result.finalHarness.limits).toEqual(defaultHarness().limits);
        expect(result.finalHarness.rules.length).toBeGreaterThan(0);
        // Drop any one learned rule and the suite can no longer reach 100%.
        for (const rule of result.finalHarness.rules) {
          const weakened = {
            ...result.finalHarness,
            rules: result.finalHarness.rules.filter((r) => r !== rule),
          };
          const suite = await runSuite(agent, weakened, tasks);
          expect(suite.passRate).toBeLessThan(1);
        }
      });

      it("deterministic — identical inputs produce the identical learned harness", async () => {
        const a = await converge(c);
        const b = await converge(c);
        expect([...a.result.finalHarness.rules].sort()).toEqual(
          [...b.result.finalHarness.rules].sort(),
        );
        expect(a.result.finalPassRate).toBe(b.result.finalPassRate);
      });

      it("gate exercised both ways — at least one rejection and one acceptance", async () => {
        const { agent, proposer, tasks } = c.make();
        const { decisions } = await drivenCampaign(agent, proposer, tasks);
        expect(decisions).toContain(true);
        expect(decisions).toContain(false);
      });
    });
  }
});
