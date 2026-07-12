import { ScriptedModel } from "../../models/scripted.js";

/**
 * A deterministic stand-in for a real model on the HTTP failure clusters. Given
 * a cluster, it returns the minimal rule fix as JSON — exactly the shape a live
 * {@link AnthropicModel} would produce — so the model-driven {@link ModelProposer}
 * path (the "model edits its own harness" path) can be demonstrated and tested
 * offline against the public-apis suite. Swap this for `new AnthropicModel()`
 * to have a real model propose the fixes.
 */
export function httpScriptedModel(): ScriptedModel {
  return new ScriptedModel([
    { match: '"request-timeout"', reply: '[{"op":"addRule","text":"timeout-ms=2000"}]' },
    { match: '"http-429-no-retry"', reply: '[{"op":"addRule","text":"retry-on-429"}]' },
    { match: '"redirect-not-followed"', reply: '[{"op":"addRule","text":"follow-redirects"}]' },
  ]);
}
