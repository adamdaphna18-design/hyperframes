import { afterEach, describe, expect, it, vi } from "vitest";
import { describeEvent, runDemo } from "./run-demo.js";

describe("demo", () => {
  afterEach(() => vi.restoreAllMocks());

  it("runs the full demo end to end without throwing", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await expect(runDemo()).resolves.toBeUndefined();
  });

  it("describeEvent renders each event type", () => {
    expect(describeEvent({ type: "round-start", round: 1, passRate: 0.25 })).toContain("round 1");
    expect(describeEvent({ type: "stuck", round: 2, pattern: "x" })).toContain("stuck");
    expect(describeEvent({ type: "done", reason: "all tasks pass" })).toContain("all tasks pass");
  });
});
