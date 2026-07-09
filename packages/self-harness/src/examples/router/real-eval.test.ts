import { describe, expect, it } from "vitest";
import { KeywordClassifier } from "./classifier.js";
import { evaluateRealRouting } from "./real-eval.js";
import { REAL_PROBLEMS } from "./real-problems.js";

describe("real problem fixture", () => {
  it("is real, sizable, four-domain, and attributed to its public sources", () => {
    expect(REAL_PROBLEMS.length).toBeGreaterThanOrEqual(120);
    const sources = new Set(REAL_PROBLEMS.map((p) => p.source));
    expect(sources).toContain("HumanEval");
    expect(sources).toContain("GSM8K");
    expect(sources).toContain("BIG-bench");
    const domains = new Set(REAL_PROBLEMS.map((p) => p.domain));
    expect(domains).toEqual(new Set(["code", "math", "reasoning", "knowledge"]));
    for (const p of REAL_PROBLEMS) {
      expect(p.prompt.length).toBeGreaterThan(10); // real problem text, not a stub
    }
  });
});

describe("router on real data", () => {
  it("classifies each problem from its text and clearly beats the best single model", () => {
    const r = evaluateRealRouting();
    // Not a suspicious 100%: the keyword classifier genuinely collides on some items.
    expect(r.routerAccuracy).toBeGreaterThan(0.8);
    expect(r.routerAccuracy).toBeLessThan(1);
    expect(r.misroutes.length).toBeGreaterThan(0);
    expect(r.routerAccuracy).toBeGreaterThan(r.bestSingleAccuracy + 0.4); // a big, real margin
    // Any single specialist covers only its own domain — a quarter of the four-domain set.
    expect(r.bestSingleAccuracy).toBeLessThanOrEqual(0.3);
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
    expect(clf.classify("What is the capital of Australia?")).toBe("knowledge");
  });

  it("is honestly fooled by a surface collision — the case the drop-in exists for", () => {
    // A knowledge question phrased with "How many" scores on the math features.
    expect(clf.classify("How many legs do horses have?")).toBe("math");
  });
});
