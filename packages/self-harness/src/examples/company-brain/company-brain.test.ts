import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultHarness } from "../../harness.js";
import { runSuite } from "../../runner.js";
import { drivenCampaign, expectLearnsUnderGate } from "../campaign-fixture.js";
import { CompanyBrain } from "./brain.js";
import { buildDemoBrain } from "./fixture.js";
import { ingest } from "./ingest.js";
import { Orchestrator } from "./orchestrator.js";
import { CompanyAgent } from "./os-agent.js";
import { CompanyPlaybookProposer } from "./os-proposer.js";
import { runCompanyBrainDemo } from "./run.js";
import { SEED_SOURCES } from "./sources.js";
import { buildCompanySuite } from "./tasks.js";
import { HARMFUL_SEO_RULE, PLAYBOOK_FOR_VERTICAL, VERTICALS } from "./verticals.js";
import { seedWarehouse } from "./warehouse.js";

const learnedPlaybooks = Object.values(PLAYBOOK_FOR_VERTICAL).filter(
  (r): r is string => typeof r === "string",
);

describe("ingest → brain", () => {
  it("compiles cross-linked pages and finds by meaning", () => {
    const pages = ingest(SEED_SOURCES);
    expect(pages.length).toBe(SEED_SOURCES.length);
    expect(pages.some((p) => p.links.length > 0)).toBe(true);

    const brain = buildDemoBrain();
    expect(brain.search("keywords intent traffic")[0]?.tags).toContain("seo");
    expect(brain.context("cro").length).toBeGreaterThan(0);
  });
});

describe("CompanyAgent under the naive harness", () => {
  it("ships only the already-performing vertical; the rest await their playbook", async () => {
    const suite = await runSuite(
      new CompanyAgent(buildDemoBrain()),
      defaultHarness(),
      buildCompanySuite(),
    );
    const byId = new Map(suite.results.map((r) => [r.taskId, r]));
    expect(byId.get("content")?.passed).toBe(true); // performs from the start
    expect(byId.get("seo")?.passed).toBe(false);
    expect(byId.get("seo")?.trajectory.failureSignals).toContain("seo");
  });

  it("fails every vertical when nothing has been ingested (the brain is load-bearing)", async () => {
    const emptyBrain = new CompanyBrain([], seedWarehouse([]));
    const suite = await runSuite(
      new CompanyAgent(emptyBrain),
      defaultHarness(),
      buildCompanySuite(),
    );
    expect(suite.results.every((r) => !r.passed)).toBe(true);
  });
});

describe("operating system: Self-Harness over the verticals", () => {
  it("reaches 100% and rejects the SEO edit that would wreck brand voice", async () => {
    const { result, decisions } = await drivenCampaign(
      new CompanyAgent(buildDemoBrain()),
      new CompanyPlaybookProposer(),
      buildCompanySuite(),
    );
    expectLearnsUnderGate(result, decisions, learnedPlaybooks);
    // The keyword-stuffing rule was never committed — the gate caught the CONTENT regression.
    expect(result.finalHarness.rules).not.toContain(HARMFUL_SEO_RULE);
  });
});

describe("orchestrator write-back: the brain compounds", () => {
  it("ships every vertical and files playbooks + metrics back into the brain", async () => {
    const brain = buildDemoBrain();
    const agent = new CompanyAgent(brain);
    const { result } = await drivenCampaign(
      agent,
      new CompanyPlaybookProposer(),
      buildCompanySuite(),
    );

    const pagesBefore = brain.pages().length;
    const orchestrator = new Orchestrator(brain, agent);
    const deliverables = await orchestrator.run(result.finalHarness);
    expect(deliverables.every((d) => d.shipped)).toBe(true);

    orchestrator.writeBack(result.finalHarness, deliverables, VERTICALS);
    expect(brain.pages().length).toBeGreaterThan(pagesBefore); // playbook pages compounded in
    expect(brain.warehouse.read("organic-sessions")).toBeGreaterThan(0.8); // measured result wrote back
  });
});

describe("company-brain demo entry point", () => {
  afterEach(() => vi.restoreAllMocks());
  it("runs the full pipeline offline without throwing", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await expect(runCompanyBrainDemo()).resolves.toBeUndefined();
  });
});
