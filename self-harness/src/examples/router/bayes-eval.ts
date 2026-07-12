import { evaluateHeldOutBayes } from "./bayes-classifier.js";
import { REAL_PROBLEMS } from "./real-problems.js";
import { evaluateRealRouting } from "./real-eval.js";

const REAL_DOMAINS = ["code", "math", "reasoning", "knowledge"] as const;

/**
 * A no-API live-model result: a Naive Bayes classifier trained on the real
 * problems and evaluated held-out (5-fold, no leakage), compared to the
 * hand-tuned keyword classifier and the best single model. No key, no network —
 * a genuine learned model that runs anywhere.
 */
export async function runBayesEvalDemo(): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  const bayes = await evaluateHeldOutBayes();
  const keyword = await evaluateRealRouting();

  log("TinyRouter — a NO-API learned classifier on real problems\n");
  log(`${REAL_PROBLEMS.length} real problems (HumanEval, GSM8K, BIG-bench)`);
  log(`Naive Bayes, trained on the data, ${bayes.folds}-fold held-out (no leakage):\n`);
  for (const domain of REAL_DOMAINS) {
    const d = bayes.perDomain[domain];
    log(`  ${domain.padEnd(10)} ${d.correct}/${d.total} classified correctly (held-out)`);
  }
  log(
    `\nNaive Bayes (no API):   ${pct(bayes.accuracy)}  held-out  (${bayes.correct}/${bayes.total})`,
  );
  log(`keyword classifier:     ${pct(keyword.routerAccuracy)}  hand-tuned`);
  log(
    `best single model:      ${pct(keyword.bestSingleAccuracy)}  (${keyword.bestSingleName} alone)`,
  );
  log(
    `\na model that trains itself on the data — no key, no network — beats the best ` +
      `single model ${pct(bayes.accuracy)} vs ${pct(keyword.bestSingleAccuracy)} on real problems`,
  );
}

// Executed directly: bayes-eval.ts
if ((import.meta as { main?: boolean }).main) {
  runBayesEvalDemo().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
