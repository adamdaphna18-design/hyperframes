import { ScriptedModel } from "../../models/scripted.js";
import { PATHOLOGY_RULE } from "./projects.js";

/**
 * A deterministic stand-in for a real model on the *rule-authoring* step. Given
 * a data-science failure cluster, the {@link ModelProposer} asks the model to
 * write the minimal harness edit that fixes it; this stand-in reads the failure
 * pattern and returns the JSON `addRule` op a rule-following model would — the
 * same shape a live `AnthropicModel` produces. It turns the loop from a *rule
 * runner* into a *rule creator*: the model, not a hard-coded heuristic, invents
 * the best practice, and the regression gate validates it before it is kept.
 *
 * Swap this for `new AnthropicModel()` to have a live model infer the fixes.
 */
export function dsScriptedModel(): ScriptedModel {
  const addRule = (pathology: keyof typeof PATHOLOGY_RULE) =>
    JSON.stringify([{ op: "addRule", text: PATHOLOGY_RULE[pathology] }]);
  return new ScriptedModel([
    { match: '"data-leakage"', reply: addRule("data-leakage") },
    { match: '"non-determinism"', reply: addRule("non-determinism") },
    { match: '"unhandled-nan"', reply: addRule("unhandled-nan") },
    { match: '"class-imbalance"', reply: addRule("class-imbalance") },
    { match: '"runaway-training"', reply: addRule("runaway-training") },
  ]);
}
