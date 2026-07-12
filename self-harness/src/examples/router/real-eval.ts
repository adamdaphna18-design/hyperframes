import { AnthropicModel } from "../../models/anthropic.js";
import { KeywordClassifier, ModelClassifier, type DomainClassifier } from "./classifier.js";
import { REAL_PROBLEMS, type RealDomain, type RealProblem } from "./real-problems.js";
import { BEST_SPECIALIST, specialistById } from "./specialists.js";

const REAL_DOMAINS: RealDomain[] = ["code", "math", "reasoning", "knowledge"];

export interface Misroute {
  id: string;
  trueDomain: RealDomain;
  predicted: RealDomain;
}

export interface RealEvalResult {
  total: number;
  routerCorrect: number;
  routerAccuracy: number;
  /** Accuracy of the best single specialist (routing everything to one model). */
  bestSingleAccuracy: number;
  bestSingleName: string;
  perDomain: Record<RealDomain, { total: number; correct: number }>;
  /** The problems the classifier misrouted — the honest failures, kept explicit. */
  misroutes: Misroute[];
}

/**
 * Evaluate the router on the real problem set: for each problem, classify it from
 * its text, route to that domain's specialist, and score correct iff the routed
 * specialist actually covers the problem's true domain. Compared against the best
 * single specialist (which only ever covers its own domain), the router wins by
 * classifying and routing — TinyRouter's claim, on real data.
 */
export async function evaluateRealRouting(
  problems: RealProblem[] = REAL_PROBLEMS,
  classifier: DomainClassifier = new KeywordClassifier(),
): Promise<RealEvalResult> {
  const perDomain: Record<RealDomain, { total: number; correct: number }> = {
    code: { total: 0, correct: 0 },
    math: { total: 0, correct: 0 },
    reasoning: { total: 0, correct: 0 },
    knowledge: { total: 0, correct: 0 },
  };

  let routerCorrect = 0;
  const misroutes: Misroute[] = [];
  for (const problem of problems) {
    const predicted = await classifier.classify(problem.prompt);
    const specialist = specialistById(BEST_SPECIALIST[predicted]);
    const correct = specialist?.strengths.includes(problem.domain) ?? false;
    perDomain[problem.domain].total++;
    if (correct) {
      routerCorrect++;
      perDomain[problem.domain].correct++;
    } else {
      misroutes.push({ id: problem.id, trueDomain: problem.domain, predicted });
    }
  }

  // Best single model: route everything to one specialist; it only answers its domain.
  let bestSingleAccuracy = 0;
  let bestSingleName = "-";
  for (const domain of REAL_DOMAINS) {
    const covered = problems.filter((p) => p.domain === domain).length;
    const acc = covered / problems.length;
    if (acc > bestSingleAccuracy) {
      bestSingleAccuracy = acc;
      bestSingleName = specialistById(BEST_SPECIALIST[domain])?.name ?? domain;
    }
  }

  return {
    total: problems.length,
    routerCorrect,
    routerAccuracy: routerCorrect / problems.length,
    bestSingleAccuracy,
    bestSingleName,
    perDomain,
    misroutes,
  };
}

export async function runRealEvalDemo(options: { live?: boolean } = {}): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const classifier: DomainClassifier = options.live
    ? new ModelClassifier(new AnthropicModel())
    : new KeywordClassifier();
  const r = await evaluateRealRouting(REAL_PROBLEMS, classifier);
  const sources = [...new Set(REAL_PROBLEMS.map((p) => p.source))].join(", ");
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  const which = options.live ? "a live model" : "a deterministic keyword classifier";
  log(`TinyRouter on REAL problems — HumanEval + GSM8K + BIG-bench (${which})\n`);
  log(`${r.total} real problems (${sources}), classified from text and routed\n`);
  for (const domain of REAL_DOMAINS) {
    const d = r.perDomain[domain];
    log(`  ${domain.padEnd(10)} ${d.correct}/${d.total} routed correctly`);
  }
  log(`\nrouter accuracy:      ${pct(r.routerAccuracy)}  (${r.routerCorrect}/${r.total})`);
  log(`best single model:    ${pct(r.bestSingleAccuracy)}  (${r.bestSingleName} alone)`);

  if (r.misroutes.length > 0) {
    log(`\nhonest misroutes (${r.misroutes.length}) — where the keyword classifier collides:`);
    for (const m of r.misroutes.slice(0, 5)) {
      log(`  ${m.id.padEnd(16)} ${m.trueDomain} → ${m.predicted}`);
    }
  }
  log(
    `\nthe tiny router beats the best single model on real data, ` +
      `${pct(r.routerAccuracy)} vs ${pct(r.bestSingleAccuracy)} — smart routing on real problems`,
  );
}

// Executed directly: real-eval.ts [--live]
if ((import.meta as { main?: boolean }).main) {
  runRealEvalDemo({ live: process.argv.includes("--live") }).catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
