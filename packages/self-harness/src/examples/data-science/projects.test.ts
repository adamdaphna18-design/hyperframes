import { describe, expect, it } from "vitest";
import { PROJECTS, projectsAtLevel, type DsLevel, type DsPathology } from "./projects.js";

describe("DS project catalog", () => {
  it("has unique ids and a required rule for every non-healthy project", () => {
    const ids = PROJECTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PROJECTS) {
      if (p.pathology === "healthy") expect(p.requiredRule).toBeUndefined();
      else expect(p.requiredRule).toBeTruthy();
    }
  });

  it("keeps the anchor projects the tests and demos rely on", () => {
    const pathologyOf = (id: string) => PROJECTS.find((p) => p.id === id)?.pathology;
    expect(pathologyOf("titanic-survival-prediction")).toBe("data-leakage");
    expect(pathologyOf("iris-flower-classification")).toBe("non-determinism");
    expect(pathologyOf("heart-failure-prediction")).toBe("unhandled-nan");
    expect(pathologyOf("song-lyrics-genre-classification")).toBe("class-imbalance");
    expect(pathologyOf("eye-disease-detection")).toBe("runaway-training");
    expect(pathologyOf("customer-churn")).toBe("healthy");
    expect(pathologyOf("gender-classification")).toBe("healthy");
  });

  it("introduces exactly one new pathology per level (the convergence contract)", () => {
    // The outer loop learns one practice at a time as the suite grows; if a level
    // introduced a pathology out of order, iteration N would learn the wrong rule.
    const expectedNew: Record<DsLevel, DsPathology[]> = {
      1: ["data-leakage", "non-determinism", "unhandled-nan"],
      2: ["class-imbalance"],
      3: ["runaway-training"],
      4: [],
    };
    const seen = new Set<DsPathology>(["healthy"]);
    for (const level of [1, 2, 3, 4] as DsLevel[]) {
      const introduced = new Set<DsPathology>();
      for (const p of projectsAtLevel(level)) {
        if (!seen.has(p.pathology)) introduced.add(p.pathology);
      }
      expect([...introduced].sort()).toEqual([...expectedNew[level]].sort());
      for (const path of introduced) seen.add(path);
    }
  });

  it("has a passing run that clears each project's threshold", () => {
    for (const p of PROJECTS) {
      if (p.metric === "none") continue;
      expect(p.targetMetric).toBeGreaterThanOrEqual(p.threshold);
    }
  });
});
