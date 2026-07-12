import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { billingReport, buildCustomerBook } from "./billing.js";
import { BillingAgent } from "./billing-agent.js";
import { PricingProposer } from "./billing-proposer.js";
import { buildBillingSuite } from "./billing-tasks.js";

/**
 * Drives the Self-Harness loop over the revenue model: you resell the cost-router's
 * ~50% LLM savings and keep a share. A naive flat take-rate churns every segment
 * whose fair share it exceeds — only the enterprise, tolerant of a higher cut,
 * stays. The loop clusters the lost segments and learns a fair price for each, and
 * the gate rejects the greedy `maximize-take-rate` rule that would grab the maximum
 * from everyone and churn even the enterprise. The output is money you *make*:
 * retained MRR/ARR climbing as the book is priced to keep, not just to close.
 */
export async function runBillingDemo(): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const agent = new BillingAgent();
  const customers = buildCustomerBook();
  const tasks = buildBillingSuite();

  log("cost-router revenue → Self-Harness");
  log(
    "you sell the ~50% LLM savings and keep a share; naive flat pricing churns all but the enterprise.\n",
  );

  const result = await selfHarness({
    agent,
    proposer: new PricingProposer(),
    tasks,
    initialHarness: defaultHarness(),
    onEvent: (e) => {
      if (e.type === "gate" && !e.decision.accepted && e.decision.regressions.length > 0) {
        log(
          `  gate rejected 'maximize-take-rate': it churns ${e.decision.regressions.length} account(s) already won`,
        );
      }
    },
  });

  const naive = billingReport(customers, new Set());
  const learned = billingReport(customers, new Set(result.finalHarness.rules));

  log(
    `\nretained accounts: ${naive.retainedCustomers}/${naive.totalCustomers} → ${learned.retainedCustomers}/${learned.totalCustomers}`,
  );
  log(`learned pricing: ${result.finalHarness.rules.join(", ")}`);
  log("");
  log(`MRR — naive flat pricing: ${usd(naive.mrr)}   learned pricing: ${usd(learned.mrr)}`);
  log(`ARR — naive: ${usd(naive.arr)}   learned: ${usd(learned.arr)}`);
  log(
    `revenue the loop unlocked: ${usd(learned.mrr - naive.mrr)}/mo (${usd(learned.arr - naive.arr)}/yr), gated so the greedy take that churns the book is rejected`,
  );
}

function usd(x: number): string {
  return `$${x.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// Executed directly: billing-run.ts
if ((import.meta as { main?: boolean }).main) {
  runBillingDemo().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
