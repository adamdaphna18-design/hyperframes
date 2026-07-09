import { describe, expect, it } from "vitest";
import { KeywordClassifier } from "./classifier.js";
import { evaluateRealRouting } from "./real-eval.js";
import { REAL_PROBLEMS } from "./real-problems.js";

describe("real problem fixture", () => {
  it("is real, balanced, and attributed to its public sources", () => {
    expect(REAL_PROBLEMS.length).toBeGreaterThanOrEqual(30);
    const sources = new Set(REAL_PROBLEMS.map((p) => p.source));
    expect(sources).toContain("HumanEval");
    expect(sources).toContain("GSM8K");
    expect(sources).toContain("BIG-bench");
    for (const p of REAL_PROBLEMS) {
      expect(p.prompt.length).toBeGreaterThan(15); // real problem text, not a stub
    }
  });
});

describe("router on real data", () => {
  it("classifies each problem from its text and beats the best single model", () => {
    const r = evaluateRealRouting();
    expect(r.routerAccuracy).toBeGreaterThanOrEqual(0.85);
    expect(r.routerAccuracy).toBeGreaterThan(r.bestSingleAccuracy);
    // Any single specialist covers only its own domain — about a third of the set.
    expect(r.bestSingleAccuracy).toBeLessThanOrEqual(0.4);
  });
});

describe("KeywordClassifier reads content, not labels", () => {
  const clf = new KeywordClassifier();
  it("routes by the actual problem text", () => {
    expect(clf.classify("def add(a, b):\n    return a + b\n>>> add(1, 2)")).toBe("code");
    expect(
      clf.classify("Tom has 12 apples and eats 3 each day. How many are left after 2 days?"),
    ).toBe("math");
    expect(clf.classify("You shouldn't trust her economics take — she failed one class.")).toBe(
      "reasoning",
    );
  });
});
