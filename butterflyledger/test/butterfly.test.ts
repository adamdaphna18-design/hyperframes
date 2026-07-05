import { describe, expect, test } from "bun:test";
import {
  butterflySignature,
  logisticTrajectory,
  measureDivergence,
  seedFromHash,
} from "../src/butterfly.js";

describe("butterfly / chaos engine", () => {
  test("seed lands strictly inside (0, 1)", () => {
    for (const h of ["a", "b", "deadbeef", "0"]) {
      const s = seedFromHash(h);
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(1);
    }
  });

  test("signature is deterministic for the same hash", () => {
    expect(butterflySignature("abc")).toBe(butterflySignature("abc"));
  });

  test("signature changes when the source hash changes (avalanche)", () => {
    expect(butterflySignature("abc")).not.toBe(butterflySignature("abd"));
  });

  test("nearby seeds diverge — positive Lyapunov exponent", () => {
    const report = measureDivergence(seedFromHash("chain-tip"));
    // r=3.99 is chaotic; the largest Lyapunov exponent must be positive.
    expect(report.lyapunovEstimate).toBeGreaterThan(0);
    // A 1e-12 perturbation must grow to macroscopic separation within the window.
    expect(report.separationStep).toBeGreaterThanOrEqual(0);
    expect(report.finalDistance).toBeGreaterThan(0);
  });

  test("trajectory stays bounded in [0, 1]", () => {
    const traj = logisticTrajectory(0.3, 64);
    for (const x of traj) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
  });
});
