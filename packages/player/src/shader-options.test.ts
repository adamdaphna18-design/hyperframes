/**
 * Unit tests for the pure shader-option helpers: attribute normalization
 * (capture scale clamping, loading-mode parsing) and URL / srcdoc injection.
 */

import { describe, expect, it } from "vitest";
import {
  SHADER_CAPTURE_SCALE_ATTR,
  SHADER_LOADING_ATTR,
  getShaderCaptureScaleFromElement,
  getShaderModeFromElement,
  prepareSrcForElement,
  prepareSrcdocForElement,
} from "./shader-options.js";

function elWith(attrs: Record<string, string>): Element {
  const el = document.createElement("div");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

describe("getShaderCaptureScaleFromElement", () => {
  it("defaults to 1 when the attribute is absent", () => {
    expect(getShaderCaptureScaleFromElement(elWith({}))).toBe(1);
  });

  it("passes through an in-range value", () => {
    expect(getShaderCaptureScaleFromElement(elWith({ [SHADER_CAPTURE_SCALE_ATTR]: "0.5" }))).toBe(
      0.5,
    );
  });

  it("clamps above 1 down to 1 and below 0.25 up to 0.25", () => {
    expect(getShaderCaptureScaleFromElement(elWith({ [SHADER_CAPTURE_SCALE_ATTR]: "2" }))).toBe(1);
    expect(getShaderCaptureScaleFromElement(elWith({ [SHADER_CAPTURE_SCALE_ATTR]: "0.1" }))).toBe(
      0.25,
    );
  });

  it("falls back to 1 for non-numeric or non-positive values", () => {
    expect(getShaderCaptureScaleFromElement(elWith({ [SHADER_CAPTURE_SCALE_ATTR]: "abc" }))).toBe(
      1,
    );
    expect(getShaderCaptureScaleFromElement(elWith({ [SHADER_CAPTURE_SCALE_ATTR]: "0" }))).toBe(1);
    expect(getShaderCaptureScaleFromElement(elWith({ [SHADER_CAPTURE_SCALE_ATTR]: "-3" }))).toBe(1);
  });
});

describe("getShaderModeFromElement", () => {
  it("defaults to composition when absent or empty", () => {
    expect(getShaderModeFromElement(elWith({}))).toBe("composition");
    expect(getShaderModeFromElement(elWith({ [SHADER_LOADING_ATTR]: "   " }))).toBe("composition");
  });

  it("parses disabling aliases to none", () => {
    for (const v of ["none", "false", "0", "off", "OFF"]) {
      expect(getShaderModeFromElement(elWith({ [SHADER_LOADING_ATTR]: v }))).toBe("none");
    }
  });

  it("parses enabling aliases to player", () => {
    for (const v of ["player", "true", "1", "on", "On"]) {
      expect(getShaderModeFromElement(elWith({ [SHADER_LOADING_ATTR]: v }))).toBe("player");
    }
  });

  it("treats unrecognized values as composition", () => {
    expect(getShaderModeFromElement(elWith({ [SHADER_LOADING_ATTR]: "wat" }))).toBe("composition");
  });
});

describe("prepareSrcForElement", () => {
  it("is a no-op when scale defaults and mode is composition", () => {
    expect(prepareSrcForElement(elWith({}), "https://x/a?b=1")).toBe("https://x/a?b=1");
  });

  it("injects capture-scale and loading params while preserving query and hash", () => {
    const el = elWith({
      [SHADER_CAPTURE_SCALE_ATTR]: "0.5",
      [SHADER_LOADING_ATTR]: "player",
    });
    const out = prepareSrcForElement(el, "https://x/a?b=1#frag");
    expect(out).toBe(
      "https://x/a?b=1&__hf_shader_capture_scale=0.5&__hf_shader_loading=player#frag",
    );
  });

  it("omits the loading param for composition mode but keeps an explicit scale", () => {
    const el = elWith({ [SHADER_CAPTURE_SCALE_ATTR]: "0.75" });
    const out = prepareSrcForElement(el, "https://x/a");
    expect(out).toBe("https://x/a?__hf_shader_capture_scale=0.75");
  });
});

describe("prepareSrcdocForElement", () => {
  it("returns the html untouched when there is nothing to inject", () => {
    const html = "<head></head><body>hi</body>";
    expect(prepareSrcdocForElement(elWith({}), html)).toBe(html);
  });

  it("injects a config script into the head", () => {
    const el = elWith({ [SHADER_CAPTURE_SCALE_ATTR]: "0.5", [SHADER_LOADING_ATTR]: "player" });
    const out = prepareSrcdocForElement(el, "<head></head><body></body>");
    expect(out).toContain("data-hyperframes-player-shader-options");
    expect(out).toContain('window.__HF_SHADER_CAPTURE_SCALE="0.5"');
    expect(out).toContain('window.__HF_SHADER_LOADING="player"');
    // Script lands right after the opening <head>.
    expect(out.indexOf("<script")).toBeGreaterThan(out.indexOf("<head"));
    expect(out.indexOf("<script")).toBeLessThan(out.indexOf("</head>"));
  });

  it("prepends the script when no head/html wrapper exists", () => {
    const el = elWith({ [SHADER_LOADING_ATTR]: "none" });
    const out = prepareSrcdocForElement(el, "<div>bare</div>");
    expect(out.startsWith("<script")).toBe(true);
    expect(out).toContain('window.__HF_SHADER_LOADING="none"');
  });
});
