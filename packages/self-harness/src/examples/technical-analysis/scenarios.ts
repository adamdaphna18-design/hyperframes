import { AAPL_CLOSES } from "./prices.js";

/**
 * Trading scenarios cut from the real AAPL series. Each is a price window ending
 * on a decision day where a specific indicator fires — the end indices were
 * chosen from verified readings (RSI > 70, a MACD bullish flip, the SMA50/200
 * golden cross, a Bollinger breakout) and the tests re-assert them, so the labels
 * come from real indicator values, not invented ones.
 */
export type TaPattern =
  | "overbought"
  | "macd-bullish"
  | "golden-cross"
  | "bollinger-breakout"
  | "neutral";

export type Signal = "buy" | "sell" | "hold";

/** The indicator rule each actionable pattern needs in the harness. */
export const RULE_FOR_PATTERN: Record<Exclude<TaPattern, "neutral">, string> = {
  overbought: "respect-rsi-overbought",
  "macd-bullish": "use-macd-confirmation",
  "golden-cross": "use-trend-cross",
  "bollinger-breakout": "use-bollinger-breakout",
};

/** The disciplined call for each pattern (derived from the indicator, not guessed). */
export const CORRECT_FOR_PATTERN: Record<TaPattern, Signal> = {
  overbought: "hold", // don't chase an overbought RSI
  "macd-bullish": "buy",
  "golden-cross": "buy",
  "bollinger-breakout": "buy",
  neutral: "hold",
};

/** The over-aggressive rule the gate must reject: buy on any positive momentum. */
export const HARMFUL_RULE = "chase-momentum";

export interface TaScenario {
  id: string;
  pattern: TaPattern;
  /** Real close prices up to and including the decision day. */
  window: number[];
  requiredRule?: string;
  correct: Signal;
  /** Rules that break this scenario if present — overbought is fooled by chase-momentum. */
  sensitiveTo: string[];
}

function scenario(id: string, pattern: TaPattern, endIndex: number): TaScenario {
  return {
    id,
    pattern,
    window: AAPL_CLOSES.slice(0, endIndex + 1),
    requiredRule: pattern === "neutral" ? undefined : RULE_FOR_PATTERN[pattern],
    correct: CORRECT_FOR_PATTERN[pattern],
    // Overbought windows have positive momentum, so a naive "chase momentum" rule
    // would wrongly buy them — that is the regression the gate protects against.
    sensitiveTo: pattern === "overbought" ? [HARMFUL_RULE] : [],
  };
}

/**
 * The scenario suite: real windows whose end index was verified against the exact
 * indicator code in `indicators.ts` (Wilder RSI, EMA-based MACD, SMA cross,
 * Bollinger). `neutral-40` has positive momentum, so it is the baseline-passing
 * guard the `chase-momentum` regression trips.
 */
export const SCENARIOS: TaScenario[] = [
  scenario("neutral-40", "neutral", 40),
  scenario("bollinger-46", "bollinger-breakout", 46),
  scenario("neutral-54", "neutral", 54),
  scenario("macd-62", "macd-bullish", 62),
  scenario("macd-103", "macd-bullish", 103),
  scenario("bollinger-106", "bollinger-breakout", 106),
  scenario("neutral-112", "neutral", 112),
  scenario("overbought-276", "overbought", 276),
  scenario("overbought-367", "overbought", 367),
  scenario("golden-cross-391", "golden-cross", 391),
];
