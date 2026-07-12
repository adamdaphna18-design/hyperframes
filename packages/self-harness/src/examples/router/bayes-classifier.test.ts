import { describe, expect, it } from "vitest";
import { evaluateHeldOutBayes, trainBayes } from "./bayes-classifier.js";
import { REAL_PROBLEMS } from "./real-problems.js";

describe("Naive Bayes classifier (no API, no network)", () => {
  it("learns from the data and generalizes held-out, crushing the best single model", async () => {
    const r = await evaluateHeldOutBayes();
    expect(r.total).toBe(REAL_PROBLEMS.length);
    // Honest held-out accuracy (5-fold, no leakage) — strong, and no key/network used.
    expect(r.accuracy).toBeGreaterThan(0.85);
    expect(r.accuracy).toBeGreaterThan(0.25 + 0.4); // far above any single model (~25%)
  });

  it("generalizes on the 'how many' knowledge questions the keyword rule misroutes", async () => {
    const r = await evaluateHeldOutBayes();
    // The keyword classifier gets 24/40 knowledge (many "how many…" collisions);
    // the learned model, weighing every word, does far better held-out.
    expect(r.perDomain.knowledge.correct).toBeGreaterThanOrEqual(30);
  });

  it("classifies a genuinely held-out 'how many' knowledge item correctly", async () => {
    const target = REAL_PROBLEMS.find(
      (p) => p.domain === "knowledge" && p.prompt.toLowerCase().startsWith("how many"),
    );
    expect(target).toBeDefined();
    const train = REAL_PROBLEMS.filter((p) => p.id !== target?.id);
    const clf = trainBayes(train); // the item is NOT in the training set
    expect(await clf.classify(target?.prompt ?? "")).toBe("knowledge");
  });

  it("is deterministic — same training data, same predictions", async () => {
    const a = trainBayes(REAL_PROBLEMS);
    const b = trainBayes(REAL_PROBLEMS);
    for (const p of REAL_PROBLEMS.slice(0, 12)) {
      expect(await a.classify(p.prompt)).toBe(await b.classify(p.prompt));
    }
  });
});
