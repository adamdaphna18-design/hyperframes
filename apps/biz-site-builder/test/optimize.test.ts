import { describe, expect, test } from "bun:test";
import {
  AA_CONTRAST,
  contrastRatio,
  hslToRgb,
  optimalInk,
  relativeLuminance,
  searchBest,
} from "../src/generate/optimize.ts";
import { paletteFor } from "../src/generate/util.ts";

describe("searchBest (verifiable-reward argmax)", () => {
  test("returns the highest-reward candidate, deterministically", () => {
    expect(searchBest([1, 2, 3, 4], (n) => -Math.abs(n - 3))).toBe(3);
    expect(searchBest(["a", "bb", "ccc"], (s) => s.length)).toBe("ccc");
    // First on ties.
    expect(searchBest([10, 20, 30], () => 5)).toBe(10);
  });
});

describe("WCAG colour math", () => {
  test("luminance and contrast match known anchors", () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
    // Black on white is the maximum 21:1.
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 1);
    // Symmetric.
    const a = { r: 20, g: 80, b: 160 };
    const b = { r: 255, g: 255, b: 255 };
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 6);
  });
  test("hslToRgb hits primary anchors", () => {
    expect(hslToRgb(0, 1, 0.5)).toEqual({ r: 255, g: 0, b: 0 });
    expect(hslToRgb(120, 1, 0.5)).toEqual({ r: 0, g: 255, b: 0 });
    expect(hslToRgb(240, 1, 0.5)).toEqual({ r: 0, g: 0, b: 255 });
  });
});

describe("optimalInk", () => {
  test("clears AA on the page background for every hue", () => {
    for (let h = 0; h < 360; h += 5) {
      const bg = hslToRgb(h, 0.3, 0.97);
      const l = Number(optimalInk(h).match(/(\d+)%\)$/)![1]) / 100;
      expect(contrastRatio(hslToRgb(h, 0.68, l), bg)).toBeGreaterThanOrEqual(AA_CONTRAST);
    }
  });
  test("picks the most vivid passing shade (no darker than necessary)", () => {
    // One step lighter would drop below AA.
    const h = 210;
    const bg = hslToRgb(h, 0.3, 0.97);
    const l = Number(optimalInk(h).match(/(\d+)%\)$/)![1]);
    expect(contrastRatio(hslToRgb(h, 0.68, l / 100), bg)).toBeGreaterThanOrEqual(AA_CONTRAST);
    expect(contrastRatio(hslToRgb(h, 0.68, (l + 1) / 100), bg)).toBeLessThan(AA_CONTRAST);
  });
  test("is deterministic and feeds the palette", () => {
    expect(optimalInk(41)).toBe(optimalInk(41));
    const p = paletteFor({ id: "x", name: "Blue Bottle", images: [], reviews: [] });
    expect(p.accentInk.startsWith("hsl(")).toBe(true);
  });
});
