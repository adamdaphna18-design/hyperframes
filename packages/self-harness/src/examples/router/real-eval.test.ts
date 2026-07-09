import { describe, expect, it } from "vitest";
import { ScriptedModel } from "../../models/scripted.js";
import {
  KeywordClassifier,
  ModelClassifier,
  parseDomain,
  type DomainClassifier,
} from "./classifier.js";
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
  it("classifies each problem from its text and clearly beats the best single model", async () => {
    const r = await evaluateRealRouting();
    // Not a suspicious 100%: the keyword classifier genuinely collides on some items.
    expect(r.routerAccuracy).toBeGreaterThan(0.8);
    expect(r.routerAccuracy).toBeLessThan(1);
    expect(r.misroutes.length).toBeGreaterThan(0);
    expect(r.routerAccuracy).toBeGreaterThan(r.bestSingleAccuracy + 0.4); // a big, real margin
    // Any single specialist covers only its own domain — a quarter of the four-domain set.
    expect(r.bestSingleAccuracy).toBeLessThanOrEqual(0.3);
  });

  it("a better classifier closes the gap — the misroutes are classifier quality, not router logic", async () => {
    // An oracle stands in for the live model: given perfect classification, the
    // router routes every real problem correctly. The keyword gap is the drop-in's job.
    const oracle: DomainClassifier = {
      classify: async (text) => REAL_PROBLEMS.find((p) => p.prompt === text)?.domain ?? "reasoning",
    };
    const r = await evaluateRealRouting(REAL_PROBLEMS, oracle);
    expect(r.routerAccuracy).toBe(1);
    expect(r.misroutes.length).toBe(0);
  });
});

describe("KeywordClassifier reads content, not labels", () => {
  const clf = new KeywordClassifier();
  it("routes by the actual problem text", async () => {
    expect(await clf.classify("def add(a, b):\n    return a + b\n>>> add(1, 2)")).toBe("code");
    expect(
      await clf.classify("Tom has 12 apples and eats 3 each day. How many are left after 2 days?"),
    ).toBe("math");
    expect(
      await clf.classify("You shouldn't trust her economics take — she failed one class."),
    ).toBe("reasoning");
    expect(await clf.classify("What is the capital of Australia?")).toBe("knowledge");
  });

  it("is honestly fooled by a surface collision — the case the drop-in exists for", async () => {
    // A knowledge question phrased with "How many" scores on the math features.
    expect(await clf.classify("How many legs do horses have?")).toBe("math");
  });
});

describe("ModelClassifier (live drop-in) — offline via a scripted model", () => {
  it("routes on the model's named domain and parses a noisy reply", async () => {
    const model = new ScriptedModel(
      [
        { match: "legs do horses", reply: "knowledge" },
        { match: "integrate", reply: "The domain is: math." },
        { match: "reverse", reply: "code" },
      ],
      () => "reasoning",
    );
    const clf = new ModelClassifier(model);
    // The collision the keyword classifier gets wrong, a model gets right.
    expect(await clf.classify("How many legs do horses have?")).toBe("knowledge");
    expect(await clf.classify("integrate x^2 from 0 to 3")).toBe("math"); // parsed from prose
    expect(await clf.classify("reverse a linked list")).toBe("code");
    expect(await clf.classify("something ambiguous")).toBe("reasoning"); // fallback
  });

  it("parseDomain takes the first domain word mentioned", () => {
    expect(parseDomain("math")).toBe("math");
    expect(parseDomain("This is clearly knowledge, not reasoning.")).toBe("knowledge");
    expect(parseDomain("no idea")).toBe("reasoning");
  });
});
