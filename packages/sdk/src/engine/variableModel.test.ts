/**
 * Unit tests for the composition variable model helpers
 * (read / write / clear of `data-composition-variables` on <html>).
 *
 * The model is the single source of truth shared by the forward-mutation path
 * and the patch-replay path, so these tests pin its parse-resilience and the
 * "never auto-add undeclared variables" invariant.
 */

import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import {
  clearVariableDefault,
  readVariableDefault,
  writeVariableDefault,
} from "./variableModel.js";

function docWith(variablesAttr?: string): Document {
  const { document } = parseHTML("<!doctype html><html><head></head><body></body></html>");
  if (variablesAttr !== undefined) {
    document.documentElement.setAttribute("data-composition-variables", variablesAttr);
  }
  return document as unknown as Document;
}

const decls = (arr: unknown[]) => JSON.stringify(arr);

describe("readVariableDefault", () => {
  it("returns the declared default for a known id", () => {
    const doc = docWith(decls([{ id: "title", default: "Hello" }]));
    expect(readVariableDefault(doc, "title")).toBe("Hello");
  });

  it("returns undefined for an unknown id", () => {
    const doc = docWith(decls([{ id: "title", default: "Hello" }]));
    expect(readVariableDefault(doc, "missing")).toBeUndefined();
  });

  it("returns undefined when the attribute is absent", () => {
    expect(readVariableDefault(docWith(), "title")).toBeUndefined();
  });

  it("returns undefined for invalid JSON", () => {
    expect(readVariableDefault(docWith("{not json"), "title")).toBeUndefined();
  });

  it("returns undefined when the value is not an array", () => {
    expect(readVariableDefault(docWith('{"id":"title"}'), "title")).toBeUndefined();
  });
});

describe("writeVariableDefault", () => {
  it("upserts the default for a declared id and reflects it on read", () => {
    const doc = docWith(decls([{ id: "title", default: "old" }]));
    expect(writeVariableDefault(doc, "title", "new")).toBe(true);
    expect(readVariableDefault(doc, "title")).toBe("new");
  });

  it("does not auto-add an undeclared variable", () => {
    const doc = docWith(decls([{ id: "title", default: "x" }]));
    expect(writeVariableDefault(doc, "ghost", 1)).toBe(false);
    expect(readVariableDefault(doc, "ghost")).toBeUndefined();
  });

  it("no-ops when the attribute is absent", () => {
    expect(writeVariableDefault(docWith(), "title", 1)).toBe(false);
  });

  it("preserves sibling keys on the declaration", () => {
    const doc = docWith(decls([{ id: "title", label: "Title", default: "old" }]));
    writeVariableDefault(doc, "title", "new");
    const raw = doc.documentElement.getAttribute("data-composition-variables")!;
    expect(JSON.parse(raw)).toEqual([{ id: "title", label: "Title", default: "new" }]);
  });
});

describe("clearVariableDefault", () => {
  it("removes the default key and round-trips a first-set undo", () => {
    const doc = docWith(decls([{ id: "title" }]));
    expect(writeVariableDefault(doc, "title", "set")).toBe(true);
    expect(clearVariableDefault(doc, "title")).toBe(true);

    expect(readVariableDefault(doc, "title")).toBeUndefined();
    const raw = doc.documentElement.getAttribute("data-composition-variables")!;
    expect(JSON.parse(raw)).toEqual([{ id: "title" }]);
  });

  it("no-ops when the declaration has no default key", () => {
    const doc = docWith(decls([{ id: "title" }]));
    expect(clearVariableDefault(doc, "title")).toBe(false);
  });

  it("no-ops for an unknown id", () => {
    const doc = docWith(decls([{ id: "title", default: 1 }]));
    expect(clearVariableDefault(doc, "missing")).toBe(false);
  });
});
