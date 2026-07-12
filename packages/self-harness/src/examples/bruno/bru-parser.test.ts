import { describe, expect, it } from "vitest";
import { parseBru, dictEntries } from "./bru-parser.js";

const SAMPLE = `meta {
  name: Create Widget
  type: http
  seq: 2
}

post {
  url: https://api.example.com/widgets
  body: json
  auth: none
}

headers {
  Accept: application/json
  ~X-Debug: 1
}

body:json {
  {
    "name": "gadget",
    "spec": { "size": 3 }
  }
}

assert {
  res.status: eq 201
}
`;

describe("parseBru", () => {
  it("parses dict blocks with values and disabled entries", () => {
    const doc = parseBru(SAMPLE);
    const meta = new Map(dictEntries(doc, "meta").map((e) => [e.name, e.value]));
    expect(meta.get("name")).toBe("Create Widget");
    expect(meta.get("seq")).toBe("2");

    const headers = dictEntries(doc, "headers");
    expect(headers.find((e) => e.name === "Accept")?.enabled).toBe(true);
    const debug = headers.find((e) => e.name === "X-Debug");
    expect(debug?.enabled).toBe(false);
  });

  it("keeps the method block and its url", () => {
    const doc = parseBru(SAMPLE);
    expect(doc.has("post")).toBe(true);
    expect(dictEntries(doc, "post").find((e) => e.name === "url")?.value).toBe(
      "https://api.example.com/widgets",
    );
  });

  it("preserves a text block's raw content, including nested braces", () => {
    const block = parseBru(SAMPLE).get("body:json");
    expect(block?.kind).toBe("text");
    if (block?.kind === "text") {
      expect(block.text).toContain('"spec": { "size": 3 }');
    }
  });
});
