import { describe, expect, it } from "vitest";
import { applyPatch, cloneHarness, defaultHarness, diffHarness } from "./harness.js";
import type { HarnessPatch } from "./types.js";

describe("harness", () => {
  it("applyPatch does not mutate the original", () => {
    const base = defaultHarness();
    const patch: HarnessPatch = {
      id: "p1",
      targetPattern: "runaway-exploration",
      rationale: "cap loops",
      ops: [
        { op: "setLimit", key: "maxToolCalls", value: 50 },
        { op: "addRule", text: "Stop exploring once you can act." },
      ],
    };
    const next = applyPatch(base, patch);

    expect(base.limits.maxToolCalls).toBe(1000);
    expect(base.rules).toHaveLength(0);
    expect(next.limits.maxToolCalls).toBe(50);
    expect(next.rules).toContain("Stop exploring once you can act.");
  });

  it("addRule is idempotent", () => {
    const base = defaultHarness();
    const patch: HarnessPatch = {
      id: "p2",
      targetPattern: "x",
      rationale: "",
      ops: [
        { op: "addRule", text: "R" },
        { op: "addRule", text: "R" },
      ],
    };
    expect(applyPatch(base, patch).rules).toEqual(["R"]);
  });

  it("diffHarness reports limit and rule changes", () => {
    const before = defaultHarness();
    const after = cloneHarness(before);
    after.limits.persistEnvAcrossSessions = true;
    after.rules.push("Persist env.");

    const diff = diffHarness(before, after);
    expect(diff).toContain("limit persistEnvAcrossSessions: false -> true");
    expect(diff).toContain("+ rule: Persist env.");
  });
});
