/**
 * A finfin trade-decision suite — the Self-Harness pattern applied to a governed
 * trading agent. The pathologies here are not modeling mistakes; they are the
 * REAL failure modes a finfin session tripped over, each a seam in a naive
 * decision harness:
 *
 *   - trade-against-regime  → took a long into a STRESS / RISK-OFF tape (the "WULF lesson")
 *   - oversized-position    → sized a lottery bet above the risk budget
 *   - chased-extended-entry → entered an extended move with no pullback (chasing)
 *   - unverified-rug        → paper-traded a new coin before the on-chain rug gate ran
 *   - pairs-on-returns      → ran cointegration on RETURNS instead of PRICE LEVELS (fake pairs)
 *
 * Each maps to a minimal harness RULE the loop learns to add, gated so a rule
 * that stops one bad trade WITHOUT breaking a legitimate one is the only kind
 * that survives. `healthy` decisions — a clean, regime-aligned, rug-passed,
 * properly-sized trade — exist so the regression gate has something to protect:
 * an over-broad "halt all trading" fix stops the bad trades but regresses the
 * healthy ones, and the gate catches it.
 *
 * IMPORTANT: this models decision OUTCOMES deterministically and executes no
 * real trade. It is advisory — the point is to teach the agent the governance
 * rails (never fight the regime, size to budget, verify before you enter) that
 * finfin's own constitution encodes. A real drop-in wires each decision to the
 * finfin organs (regime / microcap_screener / meta_strategy) behind the very
 * rules the loop learns here.
 */

export type FinfinPathology =
  | "aligned"
  | "trade-against-regime"
  | "oversized-position"
  | "chased-extended-entry"
  | "unverified-rug"
  | "pairs-on-returns";

/** The governance rule a given pathology requires; `aligned` needs none. */
export const GOVERNANCE_RULE: Record<Exclude<FinfinPathology, "aligned">, string> = {
  "trade-against-regime": "veto-trades-against-regime",
  "oversized-position": "cap-position-to-risk-budget",
  "chased-extended-entry": "require-pullback-not-chase",
  "unverified-rug": "require-onchain-rug-gate",
  "pairs-on-returns": "cointegrate-on-price-levels",
};

export interface FinfinProbe {
  id: string;
  /** One-line description of the setup the agent is asked to decide on. */
  setup: string;
  pathology: FinfinPathology;
  /** Governance rule the harness must contain to decide this correctly; absent when aligned. */
  requiredRule?: string;
  /** Independent confirmations a thorough decision cross-checks (structure/entry/discipline/regime/rug).
   *  An over-tight `maxToolCalls` throttle starves these — which is how an over-broad fix regresses a
   *  legitimate, confirmation-heavy trade. */
  confirmations: number;
}

function probe(setup: string, pathology: FinfinPathology, confirmations: number): FinfinProbe {
  return {
    id: slug(`${pathology}-${setup}`),
    setup,
    pathology,
    requiredRule: pathology === "aligned" ? undefined : GOVERNANCE_RULE[pathology],
    confirmations,
  };
}

/** The decision suite: five real pathologies + confirmation-heavy healthy trades to protect. */
export const DECISIONS: readonly FinfinProbe[] = [
  // pathologies — each needs its governance rule to decide correctly
  probe("long WULF into a RISK-OFF tape", "trade-against-regime", 3),
  probe("2% sleeve on a single lottery ticket", "oversized-position", 3),
  probe("buy the third green candle, no pullback", "chased-extended-entry", 3),
  probe("paper $100 on a fresh mint, holders unchecked", "unverified-rug", 3),
  probe("cointegrate the pair on daily returns", "pairs-on-returns", 3),
  // healthy — legitimate trades that cross-check several confirmations; the gate must protect these
  probe("aligned long, pullback entry, rug-passed, sized to budget", "aligned", 5),
  probe("regime-on breakout, disciplined size", "aligned", 5),
  probe("cointegrated pair on price levels, z-score entry", "aligned", 4),
];

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
