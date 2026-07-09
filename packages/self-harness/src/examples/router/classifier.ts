import type { RealDomain } from "./real-problems.js";

/**
 * Predicts a problem's domain from its text. This is what makes the real-data
 * evaluation honest: the router does not read a pre-attached label, it classifies
 * the raw problem statement and routes on that — so a misclassification is a real
 * misroute. The offline default is a deterministic keyword/feature scorer; a real
 * drop-in swaps in an embedding or LLM classifier behind the same interface.
 */
export interface DomainClassifier {
  classify(text: string): RealDomain;
}

const CODE_MARKERS = [
  "def ",
  "return",
  "import ",
  ">>>",
  "->",
  "list[",
  "self.",
  "lambda",
  "print(",
  "function",
  "array",
  "().",
  "string",
  "integer",
  "elements",
  "```",
];
const MATH_WORDS = [
  "how many",
  "how much",
  " per ",
  "each",
  "total",
  "dozen",
  "percent",
  "twice",
  "cost",
  "left",
  "remaining",
  "spends",
  "buys",
  "sells",
  "pays",
  "earns",
];
const REASON_WORDS = [
  "trust",
  "because",
  "therefore",
  "argument",
  "fallac",
  "valid",
  "invalid",
  "believe",
  "must be",
  "everyone",
  "nobody",
  "claim",
  "since ",
  "assume",
  "opinion",
];

/** Deterministic keyword/feature classifier — no model, no network. */
export class KeywordClassifier implements DomainClassifier {
  classify(text: string): RealDomain {
    const t = text.toLowerCase();
    const scores: Record<RealDomain, number> = {
      code: score(t, CODE_MARKERS) + (/def |>>>|->|\bself\b/.test(text) ? 4 : 0),
      math: score(t, MATH_WORDS) + Math.min((t.match(/\d+/g) ?? []).length, 6),
      reasoning: score(t, REASON_WORDS),
    };
    // Code markers are near-unambiguous; a real GSM8K/fallacy statement has none.
    if (scores.code >= 4) return "code";
    let best: RealDomain = "reasoning";
    for (const domain of ["code", "math", "reasoning"] as RealDomain[]) {
      if (scores[domain] > scores[best]) best = domain;
    }
    return best;
  }
}

function score(text: string, markers: string[]): number {
  let total = 0;
  for (const m of markers) if (text.includes(m)) total += 2;
  return total;
}
