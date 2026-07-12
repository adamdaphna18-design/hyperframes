import type { Model } from "../../types.js";
import type { RealDomain } from "./real-problems.js";

const ALL_DOMAINS: RealDomain[] = ["code", "math", "reasoning", "knowledge"];

/**
 * Predicts a problem's domain from its text. This is what makes the real-data
 * evaluation honest: the router does not read a pre-attached label, it classifies
 * the raw problem statement and routes on that — so a misclassification is a real
 * misroute. The offline default is a deterministic keyword/feature scorer; the
 * live drop-in ({@link ModelClassifier}) asks a real model behind this same
 * async interface. `classify` is async precisely so a model call fits.
 */
export interface DomainClassifier {
  classify(text: string): Promise<RealDomain>;
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
const KNOWLEDGE_WORDS = [
  "what is",
  "what was",
  "what are",
  "who ",
  "where ",
  "when ",
  "which ",
  "capital",
  "largest",
  "planet",
  "country",
  "ocean",
  "river",
  "invented",
  "discovered",
  "named",
];

/**
 * Deterministic keyword/feature classifier — no model, no network. It is honest,
 * not perfect: a knowledge question phrased as "How many legs do horses have?"
 * scores on the math features and gets misrouted — exactly the surface collision
 * an embeddings/LLM drop-in would resolve.
 */
export class KeywordClassifier implements DomainClassifier {
  async classify(text: string): Promise<RealDomain> {
    const t = text.toLowerCase();
    const scores: Record<RealDomain, number> = {
      code: score(t, CODE_MARKERS) + (/def |>>>|->|\bself\b/.test(text) ? 4 : 0),
      math: score(t, MATH_WORDS) + Math.min((t.match(/\d+/g) ?? []).length, 6),
      reasoning: score(t, REASON_WORDS),
      knowledge: score(t, KNOWLEDGE_WORDS),
    };
    // Code markers are near-unambiguous; a real GSM8K/fallacy/trivia item has none.
    if (scores.code >= 4) return "code";
    let best: RealDomain = "reasoning";
    for (const domain of ALL_DOMAINS) {
      if (scores[domain] > scores[best]) best = domain;
    }
    return best;
  }
}

/**
 * The live drop-in: asks a real {@link Model} to name the domain. This is the
 * classifier that resolves the surface collisions the keyword scorer trips on
 * ("How many legs do horses have?" is knowledge, not math) — a real model reads
 * the intent, not the tokens. Deterministic offline with a `ScriptedModel`;
 * `new AnthropicModel()` for a live run (needs `@anthropic-ai/sdk` + a key).
 */
export class ModelClassifier implements DomainClassifier {
  constructor(private readonly model: Model) {}

  async classify(text: string): Promise<RealDomain> {
    const raw = await this.model.complete({ system: CLASSIFIER_SYSTEM, user: text });
    return parseDomain(raw);
  }
}

const CLASSIFIER_SYSTEM = [
  "Classify the problem into exactly one domain.",
  "Domains: code, math, reasoning, knowledge.",
  "Reply with ONLY the single domain word, nothing else.",
].join("\n");

/** Read the first domain word the model named; default to reasoning if unclear. */
export function parseDomain(raw: string): RealDomain {
  const lower = raw.toLowerCase();
  let found: RealDomain = "reasoning";
  let at = Infinity;
  for (const domain of ALL_DOMAINS) {
    const i = lower.indexOf(domain);
    if (i !== -1 && i < at) {
      at = i;
      found = domain;
    }
  }
  return found;
}

function score(text: string, markers: string[]): number {
  let total = 0;
  for (const m of markers) if (text.includes(m)) total += 2;
  return total;
}
