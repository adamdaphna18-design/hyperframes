import type { Agent, Harness, Task, ToolCall, Trajectory } from "../../types.js";
import type { FinfinProbe } from "./catalog.js";
import { CAP_RULE, GOVERNED_ACTION } from "./catalog.js";

/** A trade decision bound to one finfin probe. */
export interface FinfinTask extends Task {
  decision: FinfinProbe;
}

/** The paper sleeve the agent sizes against, and the lottery cap on any one ticket. */
export const PAPER_SLEEVE_USD = 10_000;
export const MAX_SIZE_FRACTION = 0.01;

/** An executed paper OPEN — a governed decision commits real notional at the discovery price (marked later). */
export interface PaperTrade {
  taskId: string;
  setup: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  sizeFraction: number;
  notionalUsd: number;
}

/** The structured result a decision reports (parsed by the task verifier). */
export interface TradeResult {
  /** Whether the trade was taken GOVERNED — not merely whether it was taken. */
  governed: boolean;
  /** TAKE = a paper trade was executed; STAND_ASIDE = governance withheld it. */
  action: "TAKE" | "STAND_ASIDE";
  /** The governance breach that vetoed the trade, when any. */
  breach?: string;
  /** Confirmations cross-checked before deciding (0 when starved by a throttle). */
  confirmations?: number;
  /** The lenses actually checked, in order (structure/entry/discipline/regime/rug/…). */
  lenses?: string[];
  /** The executed paper OPEN, present only when action = TAKE. */
  paper?: PaperTrade;
  /** Plain-language reasoning: what was checked, the governance verdict, and the resulting action. */
  rationale: string;
}

const LENSES = ["structure", "entry", "discipline", "regime", "rug"] as const;

/**
 * A deterministic decision agent that not only GATES on governance but EXECUTES
 * a paper trade and explains itself. Governance is a pure function of the harness
 * and the setup: a setup carrying a pathology breaches until the matching rule is
 * in the harness; a healthy, confirmation-heavy trade breaches if `maxToolCalls`
 * is throttled below the confirmations it must cross-check.
 *
 * When a decision is governed it EXECUTES a paper OPEN — a fixed lottery ticket
 * sized against the sleeve, capped by `MAX_SIZE_FRACTION` once the
 * cap-position-to-risk-budget rule is learned (so the rule doesn't merely let the
 * trade pass, it SIZES it down). Every decision, taken or not, carries a
 * `rationale`: the lenses checked, the governance verdict, and the action. It
 * commits no real capital — the paper OPEN records entry + notional; marking to
 * P&L needs a live price feed (finfin's paper_ledger + a source).
 */
export class FinfinAgent implements Agent {
  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const { decision } = task as FinfinTask;
    const rules = new Set(harness.rules);

    // an over-tight throttle starves the confirmations a legitimate trade must cross-check (regression case)
    if (harness.limits.maxToolCalls < decision.confirmations) {
      return breach(
        decision,
        "starved-confirmations",
        `throttled to maxToolCalls=${harness.limits.maxToolCalls}, below the ${decision.confirmations} confirmations this trade needs`,
      );
    }

    // NAIVE harness: the governance rail is missing, so the agent COMMITS the pathology —
    // it takes the bad trade it should not. That is the failure the loop learns to fix.
    if (decision.requiredRule && !rules.has(decision.requiredRule)) {
      const bad = openFor(decision, rules);
      const rationale =
        `No "${decision.requiredRule}" rail in the harness → TOOK ${bad.direction} $${bad.notionalUsd} ` +
        `on "${decision.setup}". This is the ${decision.pathology} mistake.`;
      const result: TradeResult = {
        governed: false,
        action: "TAKE",
        breach: decision.pathology,
        paper: bad,
        rationale,
      };
      return {
        taskId: decision.id,
        toolCalls: [{ name: "finfin.execute", args: decision.id, ok: true, note: "ungoverned" }],
        output: JSON.stringify(result),
        failureSignals: [decision.pathology],
      };
    }

    // GOVERNED. A veto rail's correct outcome is to STAND ASIDE; a size/correction rail EXECUTES.
    const lenses = LENSES.slice(0, decision.confirmations).map((l) => l);
    const toolCalls = lenses.map((lens, i) => confirm(i, lens, decision));

    if (GOVERNED_ACTION[decision.pathology] === "veto") {
      const rationale =
        `Checked ${lenses.join(", ")}; the "${decision.requiredRule}" rail applies → ` +
        `STAND ASIDE on "${decision.setup}" (correctly refused — standing aside IS the governed call). No trade.`;
      const result: TradeResult = {
        governed: true,
        action: "STAND_ASIDE",
        confirmations: decision.confirmations,
        lenses,
        rationale,
      };
      return { taskId: decision.id, toolCalls, output: JSON.stringify(result), failureSignals: [] };
    }

    const paper = openFor(decision, rules);
    const capNote =
      decision.pathology === "oversized-position" && rules.has(CAP_RULE)
        ? ` (wanted 2%, capped to ${(paper.sizeFraction * 100).toFixed(0)}% by the risk-budget rail)`
        : decision.pathology === "pairs-on-returns"
          ? " (pair re-fit on PRICE LEVELS, not returns)"
          : "";
    const rationale =
      `Checked ${lenses.join(", ")} → all confirm; governance clean. ` +
      `EXECUTE ${paper.direction} paper open $${paper.notionalUsd} (${(paper.sizeFraction * 100).toFixed(0)}% of sleeve)${capNote}.`;
    const result: TradeResult = {
      governed: true,
      action: "TAKE",
      confirmations: decision.confirmations,
      lenses,
      paper,
      rationale,
    };
    return { taskId: decision.id, toolCalls, output: JSON.stringify(result), failureSignals: [] };
  }
}

/** Size a paper open for a decision — capped to the lottery max once the risk-budget rail is present. */
function openFor(decision: FinfinProbe, rules: Set<string>): PaperTrade {
  const wanted = decision.pathology === "oversized-position" ? 0.02 : MAX_SIZE_FRACTION;
  const sizeFraction = rules.has(CAP_RULE) ? Math.min(wanted, MAX_SIZE_FRACTION) : wanted;
  return {
    taskId: decision.id,
    setup: decision.setup,
    direction: directionOf(decision.setup),
    sizeFraction,
    notionalUsd: Math.round(PAPER_SLEEVE_USD * sizeFraction),
  };
}

function breach(decision: FinfinProbe, signal: string, why: string): Trajectory {
  const rationale = `STAND ASIDE on "${decision.setup}" — ${why}. No paper trade executed.`;
  const result: TradeResult = { governed: false, action: "STAND_ASIDE", breach: signal, rationale };
  return {
    taskId: decision.id,
    toolCalls: [{ name: "finfin.decide", args: decision.id, ok: false, note: why }],
    output: JSON.stringify(result),
    failureSignals: [signal],
  };
}

function directionOf(setup: string): "LONG" | "SHORT" | "NEUTRAL" {
  const s = setup.toLowerCase();
  if (s.includes("pair") || s.includes("cointegrat")) return "NEUTRAL"; // market-neutral spread
  if (s.includes("short")) return "SHORT";
  return "LONG";
}

function confirm(index: number, lens: string, decision: FinfinProbe): ToolCall {
  return { name: "finfin.confirm", args: `${decision.id}:${lens}`, ok: true };
}

/** Collect the executed paper OPENs from a suite of trajectories, in order. */
export function paperBook(trajectories: Trajectory[]): PaperTrade[] {
  const trades: PaperTrade[] = [];
  for (const t of trajectories) {
    const r = parse(t.output);
    if (r?.action === "TAKE" && r.paper) trades.push(r.paper);
  }
  return trades;
}

/** One human-readable reasoning line per trajectory (the agent explaining itself). */
export function renderReasoning(trajectory: Trajectory): string {
  const r = parse(trajectory.output);
  const tag = r?.action === "TAKE" ? "TAKE " : "ASIDE";
  return `[${tag}] ${trajectory.taskId}\n        ${r?.rationale ?? "no rationale"}`;
}

function parse(output: string): TradeResult | null {
  try {
    const parsed: unknown = JSON.parse(output);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as TradeResult).governed === "boolean"
    ) {
      return parsed as TradeResult;
    }
  } catch {
    // not a TradeResult envelope
  }
  return null;
}
