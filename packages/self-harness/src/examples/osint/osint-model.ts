import { ScriptedModel } from "../../models/scripted.js";
import { GUARDRAIL_RULE } from "./catalog.js";

/**
 * A deterministic stand-in for a real model on the guardrail-authoring step.
 * Given a recon compliance cluster, the {@link ModelProposer} asks the model to
 * write the minimal harness edit that fixes it; this returns the JSON `addRule`
 * op a policy-aware model would — the same shape a live `AnthropicModel`
 * produces. Swap for `new AnthropicModel()` to have a live model author the
 * guardrails, with the regression gate validating each before it is kept.
 */
export function osintScriptedModel(): ScriptedModel {
  const addRule = (pathology: keyof typeof GUARDRAIL_RULE) =>
    JSON.stringify([{ op: "addRule", text: GUARDRAIL_RULE[pathology] }]);
  return new ScriptedModel([
    { match: '"out-of-scope"', reply: addRule("out-of-scope") },
    { match: '"rate-limit-abuse"', reply: addRule("rate-limit-abuse") },
    { match: '"pii-exposure"', reply: addRule("pii-exposure") },
    { match: '"unverified-attribution"', reply: addRule("unverified-attribution") },
    { match: '"no-provenance"', reply: addRule("no-provenance") },
  ]);
}
