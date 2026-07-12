/**
 * Unit tests for deriveKeyframeBackfillDefaults — the numeric-default backfill
 * set used to keep SDK (acorn) add-keyframe ops in parity with the server
 * (recast) writer.
 */

import { describe, expect, it } from "vitest";
import { deriveKeyframeBackfillDefaults } from "./keyframeBackfill.js";

describe("deriveKeyframeBackfillDefaults", () => {
  it("maps known numeric props to their canonical rest values", () => {
    expect(deriveKeyframeBackfillDefaults({ opacity: 0, x: 50 })).toEqual({ opacity: 1, x: 0 });
  });

  it("uses the default value, not the supplied value", () => {
    expect(deriveKeyframeBackfillDefaults({ scale: 2, rotation: 90 })).toEqual({
      scale: 1,
      rotation: 0,
    });
  });

  it("skips props with no safe numeric default", () => {
    expect(deriveKeyframeBackfillDefaults({ color: "#fff", filter: "blur(2px)" })).toEqual({});
  });

  it("keeps only the known props from a mixed op", () => {
    expect(
      deriveKeyframeBackfillDefaults({ opacity: 0, color: "#000", width: 200, custom: 5 }),
    ).toEqual({ opacity: 1, width: 100 });
  });

  it("returns an empty object for an empty op", () => {
    expect(deriveKeyframeBackfillDefaults({})).toEqual({});
  });

  it("covers the full known-default table", () => {
    expect(
      deriveKeyframeBackfillDefaults({
        opacity: 9,
        x: 9,
        y: 9,
        scale: 9,
        scaleX: 9,
        scaleY: 9,
        rotation: 9,
        width: 9,
        height: 9,
      }),
    ).toEqual({
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      width: 100,
      height: 100,
    });
  });
});
