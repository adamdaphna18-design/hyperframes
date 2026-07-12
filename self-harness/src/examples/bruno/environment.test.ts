import { describe, expect, it } from "vitest";
import { interpolate, parseEnvironment } from "./environment.js";

describe("environment", () => {
  it("parses vars and interpolates placeholders", () => {
    const env = parseEnvironment(`vars {
      name: michael
      host: api.example.com
      ~unused: x
    }`);
    expect(env.get("name")).toBe("michael");
    expect(env.has("unused")).toBe(false);

    expect(interpolate("https://{{host}}/agify?name={{name}}", env)).toBe(
      "https://api.example.com/agify?name=michael",
    );
  });

  it("leaves unknown placeholders untouched", () => {
    expect(interpolate("{{missing}}", new Map())).toBe("{{missing}}");
  });
});
