import type { Agent, Harness, Task, ToolCall, Trajectory } from "../../types.js";
import { bill, takeRateFor, type Customer } from "./billing.js";

/** A task bound to one customer account. */
export interface BillingTask extends Task {
  customer: Customer;
}

/** What the billing agent reports for an account. */
export interface BillingResult {
  segment: string;
  takeRate: number;
  won: boolean;
}

/**
 * Prices and closes one customer account under the harness's pricing policy. It
 * quotes the take-rate the rules dictate for the customer's segment (or the flat
 * default when no rule covers it), then wins the account iff that price is fair
 * enough to retain *and* profitable to serve. An un-segmented default over-charges
 * the price-sensitive segments — those are the churned accounts the loop clusters.
 * The over-aggressive `maximize-take-rate` rule quotes the greedy rate to everyone:
 * it churns the accounts already retained, the revenue regression the gate catches.
 */
export class BillingAgent implements Agent {
  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const { customer } = task as BillingTask;
    const rules = new Set(harness.rules);
    const takeRate = takeRateFor(customer, rules);
    const b = bill(customer, takeRate);
    const won = b.mrr > 0;

    const toolCalls: ToolCall[] = [
      {
        name: "pricing.quote",
        args: `${customer.segment}@${Math.round(takeRate * 100)}%`,
        ok: true,
      },
      {
        name: "deal.close",
        args: won ? "won" : b.retained ? "unprofitable" : "churned",
        ok: won,
      },
    ];
    const result: BillingResult = { segment: customer.segment, takeRate, won };
    return {
      taskId: customer.id,
      toolCalls,
      output: JSON.stringify(result),
      failureSignals: won ? [] : [customer.segment],
    };
  }
}
