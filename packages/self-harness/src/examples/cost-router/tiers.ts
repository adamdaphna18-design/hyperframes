/**
 * Model tiers and the request taxonomy the cost-router routes over. Each tier is
 * a capability rung with representative list prices (USD per million tokens); the
 * router's job is to send every request to the *cheapest* tier that still clears
 * that request class's quality bar. The naive default a cautious team reaches for
 * — send everything to the strongest tier so nothing ever under-performs — is safe
 * but the single most expensive way to run an LLM workload. That gap between the
 * cautious default and the cheapest safe routing is the bill this loop cuts.
 */

export type TierId = "nano" | "haiku" | "sonnet" | "opus";

/** A model rung. `capability` is the ordinal the router compares against a class's need. */
export interface Tier {
  id: TierId;
  label: string;
  /** Ordinal capability; a higher tier answers everything a lower one can, and more. */
  capability: number;
  /** Representative list price, USD per million input tokens. */
  inPricePerMTok: number;
  /** Representative list price, USD per million output tokens. */
  outPricePerMTok: number;
}

/** Cheapest → strongest. Prices are representative list prices, not a live quote. */
export const MODEL_TIERS: Tier[] = [
  { id: "nano", label: "nano", capability: 0, inPricePerMTok: 0.1, outPricePerMTok: 0.4 },
  { id: "haiku", label: "haiku", capability: 1, inPricePerMTok: 0.8, outPricePerMTok: 4 },
  { id: "sonnet", label: "sonnet", capability: 2, inPricePerMTok: 3, outPricePerMTok: 15 },
  { id: "opus", label: "opus", capability: 3, inPricePerMTok: 15, outPricePerMTok: 75 },
];

/** Look a tier up by id (throws on an unknown id — routing rules are validated data). */
export function tierById(id: TierId): Tier {
  const t = MODEL_TIERS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown tier: ${id}`);
  return t;
}

/** The strongest tier — the cautious "everything here" default we save against. */
export const TOP_TIER: TierId = "opus";
/** The tier an unrouted request falls back to (cost-greedy, but quality-blind). */
export const DEFAULT_TIER: TierId = "haiku";

export type RequestClass =
  | "faq"
  | "classify"
  | "summarize"
  | "extract"
  | "code"
  | "reason"
  | "analyze";

/**
 * The cheapest tier that answers each class at acceptable quality — the ground
 * truth the loop must discover. faq/classify/summarize clear on haiku; extraction
 * and codegen need sonnet; multi-step reasoning and analysis need opus.
 */
export const MIN_TIER_FOR_CLASS: Record<RequestClass, TierId> = {
  faq: "haiku",
  classify: "haiku",
  summarize: "haiku",
  extract: "sonnet",
  code: "sonnet",
  reason: "opus",
  analyze: "opus",
};

/** The over-aggressive rule the gate must reject: cap every request at the cheapest tier. */
export const COST_CUT_RULE = "force-cheapest-tier";

/** Encode a per-class routing decision as a harness rule string. */
export function routeRule(cls: RequestClass, tier: TierId): string {
  return `route:${cls}:${tier}`;
}

/** Parse a `route:<class>:<tier>` rule back into its parts, or null if it isn't one. */
export function parseRoute(rule: string): { cls: RequestClass; tier: TierId } | null {
  const m = /^route:([a-z]+):([a-z]+)$/.exec(rule);
  if (!m) return null;
  return { cls: m[1] as RequestClass, tier: m[2] as TierId };
}
