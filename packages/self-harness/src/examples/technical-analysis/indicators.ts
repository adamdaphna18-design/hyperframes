/**
 * Standard technical-analysis indicators, computed deterministically on a close
 * price series (`number[]`, oldest → newest). Pure math, no network — the same
 * formulas a charting library uses, so the values are real and verifiable. These
 * are the signals the Self-Harness loop learns to trust, one gated rule at a time.
 */

/** Simple moving average of the last `period` values. */
export function sma(values: number[], period: number): number {
  const window = values.slice(-period);
  return window.reduce((a, b) => a + b, 0) / window.length;
}

/** Exponential moving average series (seeded with the first value). */
export function emaSeries(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0] ?? 0;
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = (values[i] as number) * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** Latest exponential moving average. */
export function ema(values: number[], period: number): number {
  return emaSeries(values, period).at(-1) ?? 0;
}

/** Wilder's Relative Strength Index over `period` (0–100; >70 overbought, <30 oversold). */
export function rsi(values: number[], period = 14): number {
  if (values.length <= period) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = (values[i] as number) - (values[i - 1] as number);
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = (values[i] as number) - (values[i - 1] as number);
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export interface Macd {
  macd: number;
  signal: number;
  histogram: number;
}

/** Moving Average Convergence Divergence (fast/slow/signal EMAs). */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): Macd {
  const ef = emaSeries(values, fast);
  const es = emaSeries(values, slow);
  const line = ef.map((v, i) => v - (es[i] as number));
  const signalLine = emaSeries(line, signalPeriod);
  const m = line.at(-1) ?? 0;
  const s = signalLine.at(-1) ?? 0;
  return { macd: m, signal: s, histogram: m - s };
}

export interface Bollinger {
  middle: number;
  upper: number;
  lower: number;
}

/** Bollinger Bands: SMA(period) ± k standard deviations. */
export function bollinger(values: number[], period = 20, k = 2): Bollinger {
  const window = values.slice(-period);
  const middle = window.reduce((a, b) => a + b, 0) / window.length;
  const variance = window.reduce((a, b) => a + (b - middle) ** 2, 0) / window.length;
  const sd = Math.sqrt(variance);
  return { middle, upper: middle + k * sd, lower: middle - k * sd };
}
