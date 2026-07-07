import { describe, expect, test } from "bun:test";
import { formatReport, passesThreshold, summarize, type AxeResult } from "../src/verify/axe.ts";

const result: AxeResult = {
  violations: [
    { id: "image-alt", impact: "critical", nodes: [{}, {}] },
    { id: "color-contrast", impact: "serious", nodes: [{}] },
    { id: "landmark", impact: "moderate", nodes: [{}] },
  ],
};

describe("summarize", () => {
  test("tallies by impact and rule, counting nodes", () => {
    const s = summarize(result);
    expect(s.critical).toBe(2);
    expect(s.serious).toBe(1);
    expect(s.moderate).toBe(1);
    expect(s.total).toBe(4);
    expect(s.byRule["image-alt"]).toBe(2);
  });
  test("empty result is all zeros", () => {
    expect(summarize({ violations: [] })).toEqual({
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
      total: 0,
      byRule: {},
    });
  });
});

describe("passesThreshold", () => {
  test("fails on critical/serious over the ceiling", () => {
    expect(passesThreshold(summarize(result))).toBe(false);
  });
  test("passes a clean page", () => {
    expect(passesThreshold(summarize({ violations: [] }))).toBe(true);
  });
  test("respects custom ceilings", () => {
    const s = summarize({ violations: [{ id: "x", impact: "serious", nodes: [{}] }] });
    expect(passesThreshold(s, { maxSerious: 1 })).toBe(true);
    expect(passesThreshold(s, { maxSerious: 0 })).toBe(false);
  });
});

describe("formatReport", () => {
  test("renders a pass/fail line with counts", () => {
    const line = formatReport({ file: "a.html", summary: summarize(result), passed: false });
    expect(line).toStartWith("✗ a.html");
    expect(line).toContain("crit:2");
    expect(line).toContain("image-alt");
  });
});
