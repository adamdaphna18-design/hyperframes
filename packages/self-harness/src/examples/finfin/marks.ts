import type { PaperTrade } from "./finfin-agent.js";

/**
 * Mark paper trades to a live price and compute P&L. The MARKER is pure and
 * deterministic; the PRICES are injected (the sidecar seam) — an offline test
 * passes a fixture, a live run passes a real quote map fetched from a price
 * source. finfin never fetches here; it only does the arithmetic.
 *
 * A trade opens at `entry` and is marked at `mark`; direction sets the sign
 * (LONG +, SHORT −, NEUTRAL = long the named leg, spread short leg not modeled).
 * P&L in dollars is the return times the notional actually committed.
 */

/** A live price for one instrument: where the trade opened, and where it is now. */
export interface Priced {
  entry: number;
  mark: number;
}

export type PriceMap = Record<string, Priced>;

export interface MarkedTrade {
  taskId: string;
  ticker: string;
  direction: PaperTrade["direction"];
  notionalUsd: number;
  entry: number;
  mark: number;
  returnPct: number;
  pnlUsd: number;
}

export interface BookPnl {
  marked: MarkedTrade[];
  totalNotional: number;
  totalPnlUsd: number;
  totalReturnPct: number;
  unpriced: string[];
}

function sign(direction: PaperTrade["direction"]): number {
  return direction === "SHORT" ? -1 : 1; // LONG and NEUTRAL (long the named leg) are +1
}

/** Mark one trade to its price. Returns null if the instrument is unpriced or the entry is non-positive. */
export function markTrade(trade: PaperTrade, prices: PriceMap): MarkedTrade | null {
  const p = prices[trade.ticker];
  if (!p || p.entry <= 0) return null;
  const ret = (sign(trade.direction) * (p.mark - p.entry)) / p.entry;
  return {
    taskId: trade.taskId,
    ticker: trade.ticker,
    direction: trade.direction,
    notionalUsd: trade.notionalUsd,
    entry: p.entry,
    mark: p.mark,
    returnPct: round(ret, 6),
    pnlUsd: round(trade.notionalUsd * ret, 2),
  };
}

/** Mark a whole book of trades and roll up total P&L. Unpriced instruments are listed, never guessed. */
export function markBook(trades: PaperTrade[], prices: PriceMap): BookPnl {
  const marked: MarkedTrade[] = [];
  const unpriced: string[] = [];
  for (const t of trades) {
    const m = markTrade(t, prices);
    if (m) marked.push(m);
    else unpriced.push(t.ticker);
  }
  const totalNotional = marked.reduce((s, m) => s + m.notionalUsd, 0);
  const totalPnlUsd = round(
    marked.reduce((s, m) => s + m.pnlUsd, 0),
    2,
  );
  return {
    marked,
    totalNotional,
    totalPnlUsd,
    totalReturnPct: totalNotional > 0 ? round(totalPnlUsd / totalNotional, 6) : 0,
    unpriced,
  };
}

function round(x: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
