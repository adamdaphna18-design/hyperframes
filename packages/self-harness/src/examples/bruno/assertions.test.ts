import { describe, expect, it } from "vitest";
import { parseBru } from "./bru-parser.js";
import { evaluateAssertions, parseAssertions, resolvePath } from "./assertions.js";

const doc = parseBru(`assert {
  res.status: eq 200
  res.body.age: gt 0
  res.body.name: eq michael
  ~res.body.ignored: eq nope
}`);

describe("assertions", () => {
  it("parses enabled assertions and skips disabled ones", () => {
    const assertions = parseAssertions(doc);
    expect(assertions).toHaveLength(3);
    expect(assertions[0]).toEqual({ expression: "res.status", operator: "eq", expected: "200" });
  });

  it("passes when the response satisfies every assertion", () => {
    const result = evaluateAssertions(parseAssertions(doc), {
      status: 200,
      body: { name: "michael", age: 63 },
    });
    expect(result.passed).toBe(true);
  });

  it("reports the first failing assertion", () => {
    const result = evaluateAssertions(parseAssertions(doc), {
      status: 429,
      body: { name: "michael", age: 63 },
    });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("res.status");
  });

  it("resolves nested and indexed paths", () => {
    const response = { status: 200, body: [{ name: { common: "Chad" } }] };
    expect(resolvePath(response, "res.status")).toBe(200);
    expect(resolvePath(response, "res.body[0].name.common")).toBe("Chad");
    expect(resolvePath(response, "res.body[0].missing")).toBeUndefined();
  });

  it("supports contains and isDefined operators", () => {
    const assertions = parseAssertions(
      parseBru(`assert {
        res.body.message: contains https
        res.body.id: isDefined
      }`),
    );
    const ok = evaluateAssertions(assertions, {
      status: 200,
      body: { message: "https://x/y.jpg", id: 7 },
    });
    expect(ok.passed).toBe(true);
    const bad = evaluateAssertions(assertions, {
      status: 200,
      body: { message: "ftp://x", id: 7 },
    });
    expect(bad.passed).toBe(false);
  });
});
