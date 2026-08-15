import { TOP_TIER, tierById, type RequestClass, type TierId } from "./tiers.js";

/** A request's token profile — what it costs to run once, in tokens. */
export interface TokenProfile {
  inTokens: number;
  outTokens: number;
}

/** One unit of a workload: a request of some class with a token profile. */
export interface CostRequest {
  id: string;
  cls: RequestClass;
  tokens: TokenProfile;
}

/** USD to run one request at a given tier, from that tier's per-MTok list prices. */
export function requestCost(tier: TierId, tokens: TokenProfile): number {
  const t = tierById(tier);
  return (tokens.inTokens / 1e6) * t.inPricePerMTok + (tokens.outTokens / 1e6) * t.outPricePerMTok;
}

/** A routing function: which tier a given request is sent to. */
export type Routing = (req: CostRequest) => TierId;

/** Total USD to serve a batch of requests once under a routing. */
export function routingCost(requests: CostRequest[], routing: Routing): number {
  return requests.reduce((sum, req) => sum + requestCost(routing(req), req.tokens), 0);
}

export interface SavingsReport {
  /** Cost of the cautious default: every request on the top tier. */
  defaultCost: number;
  /** Cost under the learned routing. */
  learnedCost: number;
  savings: number;
  savingsPct: number;
  /** Projected monthly savings at the given request volume. */
  monthlySavings: number;
}

/**
 * The money the router makes. Baseline is the cautious default every team reaches
 * for — send *everything* to the strongest tier so nothing under-performs. The
 * learned routing matches that quality (the gate guarantees no regression) at a
 * fraction of the spend; the delta is the recurring bill you cut, and the number
 * a "% of savings" contract is written against.
 */
export function savingsReport(
  requests: CostRequest[],
  learned: Routing,
  monthlyVolume: number,
): SavingsReport {
  const defaultCost = routingCost(requests, () => TOP_TIER);
  const learnedCost = routingCost(requests, learned);
  const savings = defaultCost - learnedCost;
  const perRequestSaving = requests.length > 0 ? savings / requests.length : 0;
  return {
    defaultCost,
    learnedCost,
    savings,
    savingsPct: defaultCost > 0 ? savings / defaultCost : 0,
    monthlySavings: perRequestSaving * monthlyVolume,
  };
}
