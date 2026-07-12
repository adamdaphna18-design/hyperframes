import { ScriptedModel } from "../../models/scripted.js";
import { GOVERNANCE_RULE } from "./catalog.js";

/**
 * A deterministic stand-in for a real model on the rule-authoring step. Given a
 * governance-breach cluster, the {@link ModelProposer} asks the model to write
 * the minimal harness edit that fixes it; this returns the JSON `addRule` op a
 * governance-aware model would — the same shape a live `AnthropicModel` produces.
 * Swap for `new AnthropicModel()` to have a live model author the rules, with the
 * regression gate validating each before it is kept.
 */
export function finfinScriptedModel(): ScriptedModel {
  const addRule = (pathology: keyof typeof GOVERNANCE_RULE) =>
    JSON.stringify([{ op: "addRule", text: GOVERNANCE_RULE[pathology] }]);
  return new ScriptedModel([
    { match: '"trade-against-regime"', reply: addRule("trade-against-regime") },
    { match: '"oversized-position"', reply: addRule("oversized-position") },
    { match: '"chased-extended-entry"', reply: addRule("chased-extended-entry") },
    { match: '"unverified-rug"', reply: addRule("unverified-rug") },
    { match: '"pairs-on-returns"', reply: addRule("pairs-on-returns") },
  ]);
}
