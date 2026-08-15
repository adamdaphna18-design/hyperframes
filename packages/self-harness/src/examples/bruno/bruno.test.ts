import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { HttpAgent, type HttpEnvelope } from "../public-apis/http-agent.js";
import { HttpHeuristicProposer } from "../public-apis/http-proposer.js";
import {
  buildBrunoSuite,
  bruRequestToTask,
  demoCollectionDir,
  loadBrunoCollection,
} from "./collection.js";
import { runBrunoDemo } from "./run.js";

const envelope = (e: HttpEnvelope) => JSON.stringify(e);

describe("Bruno collection loading", () => {
  it("loads every .bru request and applies the environment", () => {
    const requests = loadBrunoCollection(demoCollectionDir(), { environment: "demo" });
    expect(requests).toHaveLength(6);
    const agify = requests.find((r) => r.name === "Agify");
    // {{name}} interpolated from environments/demo.bru
    expect(agify?.url).toBe("https://api.agify.io?name=michael");
    expect(agify?.assertions.length).toBeGreaterThan(0);
  });
});

describe("bruRequestToTask check (assert block becomes the verifier)", () => {
  const [task] = buildBrunoSuite(demoCollectionDir(), { environment: "demo" }).filter(
    (t) => t.id === "cat-facts",
  );

  it("passes when the response envelope satisfies the assertions", () => {
    const out = envelope({ status: 200, body: '{"fact":"Cats purr.","length":10}' });
    expect(task?.check(out).passed).toBe(true);
  });

  it("fails on a non-200 envelope (res.status: eq 200)", () => {
    const out = envelope({ status: 408, error: "request-timeout" });
    expect(task?.check(out).passed).toBe(false);
  });
});

describe("Self-Harness over a Bruno collection", () => {
  it("tunes the harness from partial to full pass rate", async () => {
    const result = await selfHarness({
      agent: new HttpAgent(undefined, { envelope: true }),
      proposer: new HttpHeuristicProposer(),
      tasks: buildBrunoSuite(demoCollectionDir(), { environment: "demo" }),
      initialHarness: defaultHarness(),
    });
    expect(result.initialPassRate).toBeLessThan(1);
    expect(result.finalPassRate).toBe(1);
    expect(result.finalHarness.rules).toEqual(
      expect.arrayContaining(["timeout-ms=2000", "retry-on-429", "follow-redirects"]),
    );
  });
});

describe("bruno demo entry point", () => {
  afterEach(() => vi.restoreAllMocks());
  it("runs offline without throwing", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await expect(runBrunoDemo()).resolves.toBeUndefined();
  });
});

describe("bruRequestToTask is invoked (concrete usage for analysis)", () => {
  it("builds a task from a hand-made request", () => {
    const task = bruRequestToTask({
      name: "Ad Hoc",
      type: "http",
      method: "GET",
      url: "https://catfact.ninja/fact",
      headers: [],
      query: [],
      assertions: [{ expression: "res.status", operator: "eq", expected: "200" }],
    });
    expect(task.id).toBe("ad-hoc");
    expect(task.check(envelope({ status: 200, body: "{}" })).passed).toBe(true);
  });
});
