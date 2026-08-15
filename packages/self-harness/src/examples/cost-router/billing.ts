import { savingsReport } from "./cost.js";
import { buildRequests } from "./requests.js";
import { MIN_TIER_FOR_CLASS } from "./tiers.js";

/**
 * The revenue layer on top of the cost-router. The router *saves* a customer money;
 * this is how you *make* money from it — you sell the savings and keep a share. The
 * harness here is the **pricing policy** (one `price:<segment>:<rate>` rule per
 * segment), and the failures the loop clusters are lost accounts: a customer churns
 * when the take-rate exceeds the share of savings its segment will happily pay. The
 * gate protects retained revenue, so the greedy "grab the max everywhere" move —
 * which pumps revenue-per-deal but churns the book — is rejected. Pricing you can't
 * keep isn't revenue.
 */

export type SegmentId = "startup" | "midmarket" | "enterprise";

export interface Segment {
  id: SegmentId;
  label: string;
  /** The largest share of its savings this segment will pay before it churns. */
  fairShare: number;
  /** Monthly request volume a customer in this segment runs through the router. */
  monthlyRequests: number;
  /** Monthly USD to serve one such customer (support + infra overhead). */
  serveCost: number;
}

export const SEGMENTS: Record<SegmentId, Segment> = {
  startup: {
    id: "startup",
    label: "startup",
    fairShare: 0.2,
    monthlyRequests: 100_000,
    serveCost: 50,
  },
  midmarket: {
    id: "midmarket",
    label: "mid-market",
    fairShare: 0.3,
    monthlyRequests: 500_000,
    serveCost: 200,
  },
  enterprise: {
    id: "enterprise",
    label: "enterprise",
    fairShare: 0.4,
    monthlyRequests: 3_000_000,
    serveCost: 1500,
  },
};

export interface Customer {
  id: string;
  segment: SegmentId;
}

/** A representative early book: many startups, a few mid-market, one enterprise. */
const BOOK: Record<SegmentId, number> = { startup: 6, midmarket: 3, enterprise: 1 };

/** Expand the book into individual customer accounts (the loop's tasks). */
export function buildCustomerBook(): Customer[] {
  const out: Customer[] = [];
  for (const seg of Object.keys(BOOK) as SegmentId[]) {
    for (let i = 0; i < BOOK[seg]; i++) out.push({ id: `${seg}-${i}`, segment: seg });
  }
  return out;
}

/** The flat take-rate a naive founder charges everyone before learning to segment. */
export const DEFAULT_TAKE_RATE = 0.35;
/** The over-aggressive rule the gate must reject: grab the maximum take everywhere. */
export const MAXIMIZE_TAKE_RULE = "maximize-take-rate";
const GREEDY_TAKE_RATE = 0.9;

/** The USD saved per request by the learned router routing, vs the all-opus default. */
const PER_REQUEST_SAVING = (() => {
  const batch = buildRequests();
  const report = savingsReport(batch, (r) => MIN_TIER_FOR_CLASS[r.cls], 1);
  return report.savings / batch.length;
})();

/** What the router saves one customer per month — the pool your take-rate cuts from. */
export function customerSavings(c: Customer): number {
  return PER_REQUEST_SAVING * SEGMENTS[c.segment].monthlyRequests;
}

/** The monthly invoice to a customer at a take-rate: your share of their savings. */
export function invoice(c: Customer, takeRate: number): number {
  return takeRate * customerSavings(c);
}

export interface Billing {
  retained: boolean;
  profitable: boolean;
  /** Monthly recurring revenue this account contributes (0 if churned or unprofitable). */
  mrr: number;
}

/** Bill one account at a take-rate: retained iff fair, profitable iff it beats serve cost. */
export function bill(c: Customer, takeRate: number): Billing {
  const seg = SEGMENTS[c.segment];
  const retained = takeRate <= seg.fairShare;
  const amount = invoice(c, takeRate);
  const profitable = amount - seg.serveCost > 0;
  return { retained, profitable, mrr: retained && profitable ? amount : 0 };
}

/** Encode a per-segment pricing decision as a harness rule string. */
export function priceRule(seg: SegmentId, rate: number): string {
  return `price:${seg}:${rate}`;
}

/** Parse a `price:<segment>:<rate>` rule back into its parts, or null. */
export function parsePrice(rule: string): { seg: SegmentId; rate: number } | null {
  const m = /^price:([a-z]+):([0-9.]+)$/.exec(rule);
  if (!m) return null;
  return { seg: m[1] as SegmentId, rate: Number(m[2]) };
}

/** The take-rate the harness charges a customer: the greedy override, a segment rule, or the flat default. */
export function takeRateFor(c: Customer, rules: Set<string>): number {
  if (rules.has(MAXIMIZE_TAKE_RULE)) return GREEDY_TAKE_RATE;
  for (const rule of rules) {
    const p = parsePrice(rule);
    if (p && p.seg === c.segment) return p.rate;
  }
  return DEFAULT_TAKE_RATE;
}

export interface BillingReport {
  retainedCustomers: number;
  totalCustomers: number;
  mrr: number;
  arr: number;
}

/** The money you make: retained MRR/ARR across the whole book under a pricing harness. */
export function billingReport(customers: Customer[], rules: Set<string>): BillingReport {
  let mrr = 0;
  let retained = 0;
  for (const c of customers) {
    const b = bill(c, takeRateFor(c, rules));
    if (b.mrr > 0) {
      mrr += b.mrr;
      retained += 1;
    }
  }
  return { retainedCustomers: retained, totalCustomers: customers.length, mrr, arr: mrr * 12 };
}
