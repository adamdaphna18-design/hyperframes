import type { Model } from "../types.js";

/**
 * A deterministic {@link Model} for offline runs and tests. It answers a prompt
 * by matching it against a list of substring rules (first match wins); an
 * optional fallback handles anything unmatched. No network, fully reproducible.
 */
export class ScriptedModel implements Model {
  readonly name = "scripted";

  constructor(
    private readonly rules: Array<{ match: string | RegExp; reply: string }>,
    private readonly fallback: (user: string) => string = () => "[]",
  ) {}

  async complete(input: { system?: string; user: string }): Promise<string> {
    for (const rule of this.rules) {
      const hit =
        typeof rule.match === "string"
          ? input.user.includes(rule.match)
          : rule.match.test(input.user);
      if (hit) return rule.reply;
    }
    return this.fallback(input.user);
  }
}
