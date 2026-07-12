import type { PriceMap } from "./marks.js";

/**
 * A REAL price snapshot (entry = prior close, mark = last) captured from a live quote source, frozen so the
 * demo and tests are deterministic. A live run replaces this with a fresh fetch — the marker is the same.
 * These are the instruments the finfin decision suite maps to; the WULF row is why the regime veto matters.
 */
export const LIVE_PRICES_ASOF = "2026-07-10";

export const LIVE_PRICES: PriceMap = {
  WULF: { entry: 23.2, mark: 21.97 }, // −5.3% — the trade the regime veto correctly declined
  PLTR: { entry: 129.04, mark: 126.79 },
  SMCI: { entry: 28.24, mark: 28.31 },
  NVDA: { entry: 202.78, mark: 210.96 }, // +4.0%
  AAPL: { entry: 316.22, mark: 315.32 },
  MSFT: { entry: 384.36, mark: 385.1 },
  GLD: { entry: 378.18, mark: 377.01 },
  DOGEUSD: { entry: 0.07326222, mark: 0.07311 },
};
