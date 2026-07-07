import { describe, expect, it } from "vitest";
import { SimulatedAgent } from "./agents/simulated.js";
import { clusterFailures } from "./cluster.js";
import { defaultHarness } from "./harness.js";
import { runSuite } from "./runner.js";
import { buildDemoSuite } from "./demo/pathologies.js";

describe("clusterFailures", () => {
  it("groups the demo suite's failures by pathology, largest first", async () => {
    const suite = await runSuite(new SimulatedAgent(), defaultHarness(), buildDemoSuite());
    const clusters = clusterFailures(suite);

    const patterns = clusters.map((c) => c.pattern);
    expect(patterns).toContain("runaway-exploration");
    expect(patterns).toContain("repeated-failed-command");
    expect(patterns).toContain("lost-env-var");
    // Healthy tasks pass, so no "healthy" cluster.
    expect(patterns).not.toContain("healthy");

    // Sorted by descending count.
    for (let i = 1; i < clusters.length; i++) {
      const prev = clusters[i - 1];
      const cur = clusters[i];
      if (prev && cur) expect(prev.count).toBeGreaterThanOrEqual(cur.count);
    }

    // Each pathology has two tasks in the demo suite.
    const runaway = clusters.find((c) => c.pattern === "runaway-exploration");
    expect(runaway?.count).toBe(2);
  });
});
