import type { Agent, Harness, Task, ToolCall, Trajectory } from "../../types.js";
import type { CostRequest } from "./cost.js";
import {
  COST_CUT_RULE,
  DEFAULT_TIER,
  MIN_TIER_FOR_CLASS,
  parseRoute,
  tierById,
  type TierId,
} from "./tiers.js";

/** A task bound to one request. */
export interface CostTask extends Task {
  request: CostRequest;
}

/** What the router reports for a request. */
export interface CostResult {
  tier: TierId;
  cls: string;
}

/**
 * Routes each request to a model tier according to the harness's `route:*` rules,
 * then answers at that tier. Quality is a step function of capability: a request
 * is served acceptably iff the routed tier is at least its class's minimum viable
 * tier. An unrouted class falls back to the cost-greedy default (haiku), which is
 * wrong for anything needing sonnet or opus — those are the under-served requests
 * the loop clusters. The over-aggressive `force-cheapest-tier` rule caps *every*
 * request at the cheapest tier: it does slash the bill, but it regresses the
 * classes already routed correctly — the regression the gate catches.
 */
export class CostRouter implements Agent {
  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const { request } = task as CostTask;
    const rules = new Set(harness.rules);
    const tier = route(request, rules);
    const minViable = MIN_TIER_FOR_CLASS[request.cls];
    const ok = tierById(tier).capability >= tierById(minViable).capability;

    const toolCalls: ToolCall[] = [
      { name: "router.route", args: `${request.cls}->${tier}`, ok: true },
      { name: "model.call", args: tier, ok },
    ];
    const result: CostResult = { tier, cls: request.cls };
    return {
      taskId: request.id,
      toolCalls,
      output: JSON.stringify(result),
      failureSignals: ok ? [] : [request.cls],
    };
  }
}

function route(request: CostRequest, rules: Set<string>): TierId {
  // The over-aggressive cost rule overrides everything: slam every request onto
  // the cheapest tier. It "saves the most" but under-serves anything above nano.
  if (rules.has(COST_CUT_RULE)) return "nano";

  for (const rule of rules) {
    const parsed = parseRoute(rule);
    if (parsed && parsed.cls === request.cls) return parsed.tier;
  }
  return DEFAULT_TIER;
}
