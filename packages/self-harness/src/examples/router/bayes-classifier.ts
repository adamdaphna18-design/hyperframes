import type { DomainClassifier } from "./classifier.js";
import { REAL_PROBLEMS, type RealDomain, type RealProblem } from "./real-problems.js";

const DOMAINS: RealDomain[] = ["code", "math", "reasoning", "knowledge"];

/**
 * A no-API live classifier: a multinomial Naive Bayes text model trained on the
 * problems themselves. No key, no network, no hand-written keyword list — it
 * learns word→domain associations from data, so it can tell that "How many legs
 * do horses have?" is knowledge (the words `legs`/`horses`/`have` carry the
 * signal) where a keyword scorer sees only "how many" and says math. Deterministic
 * and offline; evaluated held-out so the accuracy is honest, not memorized.
 */
interface Trained {
  logPrior: Record<RealDomain, number>;
  logLik: Record<RealDomain, Map<string, number>>;
  unseenLogLik: Record<RealDomain, number>;
}

export class BayesClassifier implements DomainClassifier {
  constructor(private readonly model: Trained) {}

  async classify(text: string): Promise<RealDomain> {
    const tokens = tokenize(text);
    let best: RealDomain = "reasoning";
    let bestScore = -Infinity;
    for (const domain of DOMAINS) {
      let s = this.model.logPrior[domain];
      for (const tok of tokens)
        s += this.model.logLik[domain].get(tok) ?? this.model.unseenLogLik[domain];
      if (s > bestScore) {
        bestScore = s;
        best = domain;
      }
    }
    return best;
  }
}

/** Train a Naive Bayes classifier (Laplace-smoothed) on a set of labeled problems. */
export function trainBayes(problems: RealProblem[]): BayesClassifier {
  const wordCounts = emptyByDomain(() => new Map<string, number>());
  const totalWords = emptyByDomain(() => 0);
  const docCounts = emptyByDomain(() => 0);
  const vocab = new Set<string>();

  for (const p of problems) {
    docCounts[p.domain]++;
    for (const tok of tokenize(p.prompt)) {
      vocab.add(tok);
      wordCounts[p.domain].set(tok, (wordCounts[p.domain].get(tok) ?? 0) + 1);
      totalWords[p.domain]++;
    }
  }

  const vocabSize = vocab.size || 1;
  const totalDocs = problems.length || 1;
  const logPrior = emptyByDomain(() => 0);
  const logLik = emptyByDomain(() => new Map<string, number>());
  const unseenLogLik = emptyByDomain(() => 0);

  for (const domain of DOMAINS) {
    logPrior[domain] = Math.log((docCounts[domain] + 1) / (totalDocs + DOMAINS.length));
    const denom = totalWords[domain] + vocabSize;
    for (const [word, count] of wordCounts[domain]) {
      logLik[domain].set(word, Math.log((count + 1) / denom));
    }
    unseenLogLik[domain] = Math.log(1 / denom);
  }

  return new BayesClassifier({ logPrior, logLik, unseenLogLik });
}

export interface HeldOutResult {
  accuracy: number;
  correct: number;
  total: number;
  folds: number;
  perDomain: Record<RealDomain, { total: number; correct: number }>;
}

/**
 * Honest held-out evaluation: deterministic k-fold cross-validation. Each fold is
 * classified by a model trained only on the *other* folds, so no problem is ever
 * scored by a model that saw it. Folds are cut by index (no RNG), so the result
 * is fully reproducible.
 */
export async function evaluateHeldOutBayes(
  problems: RealProblem[] = REAL_PROBLEMS,
  folds = 5,
): Promise<HeldOutResult> {
  const perDomain = emptyByDomain(() => ({ total: 0, correct: 0 }));
  let correct = 0;

  for (let f = 0; f < folds; f++) {
    const test = problems.filter((_, i) => i % folds === f);
    const train = problems.filter((_, i) => i % folds !== f);
    const clf = trainBayes(train);
    for (const p of test) {
      perDomain[p.domain].total++;
      if ((await clf.classify(p.prompt)) === p.domain) {
        correct++;
        perDomain[p.domain].correct++;
      }
    }
  }

  return {
    accuracy: correct / (problems.length || 1),
    correct,
    total: problems.length,
    folds,
    perDomain,
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function emptyByDomain<T>(make: () => T): Record<RealDomain, T> {
  return { code: make(), math: make(), reasoning: make(), knowledge: make() };
}
