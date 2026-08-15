import { bill, buildCustomerBook, type Customer } from "./billing.js";
import type { BillingResult, BillingTask } from "./billing-agent.js";

/** Build the task suite: one deal to win-and-retain per customer in the book. */
export function buildBillingSuite(): BillingTask[] {
  return buildCustomerBook().map(toTask);
}

function toTask(customer: Customer): BillingTask {
  return {
    id: customer.id,
    prompt: `Price the ${customer.segment} account to win and retain it profitably.`,
    customer,
    check(output: string) {
      const result = parseResult(output);
      if (!result) return { passed: false, detail: "no quote" };
      const b = bill(customer, result.takeRate);
      const passed = b.mrr > 0;
      const rate = `${Math.round(result.takeRate * 100)}%`;
      return {
        passed,
        detail: passed
          ? `${customer.segment}@${rate} won ($${Math.round(b.mrr)}/mo)`
          : `${customer.segment}@${rate} ${b.retained ? "unprofitable" : "churned"}`,
      };
    },
  };
}

function parseResult(output: string): BillingResult | null {
  try {
    const parsed: unknown = JSON.parse(output);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as BillingResult).takeRate === "number"
    ) {
      return parsed as BillingResult;
    }
  } catch {
    // not a BillingResult envelope
  }
  return null;
}
