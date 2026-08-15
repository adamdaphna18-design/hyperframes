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

/**
 * A deterministic model for the *refining* proposer. Unlike {@link dsScriptedModel},
 * this one deliberately reaches for the blunt fix first: for "runaway-training"
 * its opening move is the over-aggressive compute clamp — which the regression
 * gate rejects for starving the heavy projects. Shown that rejection — the refine
 * prompt echoes the rejected ops, so it contains the clamp's signature — it
 * switches to the clean `use-early-stopping` rule. That reject→refine step is
 * exactly what {@link RefiningModelProposer} exists to capture; every other pattern
 * is fixed correctly on the first try.
 *
 * Swap this for `new AnthropicModel()` to have a live model do the self-correction.
 */
export function refiningDsScriptedModel(): ScriptedModel {
  const addRule = (pathology: keyof typeof PATHOLOGY_RULE) =>
    JSON.stringify([{ op: "addRule", text: PATHOLOGY_RULE[pathology] }]);
  return new ScriptedModel([
    // A retry after the clamp was rejected (its exact signature is echoed in the
    // feedback) → the clean rule. Keyed on the clamp, not a bare "REJECTED", so a
    // rejection on any other cluster would not wrongly return the early-stopping rule.
    { match: '"maxToolCalls","value":3', reply: addRule("runaway-training") },
    // First pass at runaway-training: reach for the blunt compute clamp.
    {
      match: '"runaway-training"',
      reply: JSON.stringify([{ op: "setLimit", key: "maxToolCalls", value: 3 }]),
    },
    { match: '"data-leakage"', reply: addRule("data-leakage") },
    { match: '"non-determinism"', reply: addRule("non-determinism") },
    { match: '"unhandled-nan"', reply: addRule("unhandled-nan") },
    { match: '"class-imbalance"', reply: addRule("class-imbalance") },
  ]);
}
