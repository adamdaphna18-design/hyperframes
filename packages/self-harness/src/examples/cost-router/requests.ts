import type { CostRequest, TokenProfile } from "./cost.js";
import type { RequestClass } from "./tiers.js";

/** Representative token profiles per class (input, output) — real-shaped, not live. */
const TOKENS: Record<RequestClass, TokenProfile> = {
  faq: { inTokens: 300, outTokens: 150 },
  classify: { inTokens: 400, outTokens: 20 },
  summarize: { inTokens: 2000, outTokens: 300 },
  extract: { inTokens: 1500, outTokens: 400 },
  code: { inTokens: 1200, outTokens: 800 },
  reason: { inTokens: 1000, outTokens: 1200 },
  analyze: { inTokens: 3000, outTokens: 1500 },
};

/** The workload mix: how many requests of each class in one representative batch. */
const MIX: Record<RequestClass, number> = {
  faq: 5,
  classify: 4,
  summarize: 3,
  extract: 3,
  code: 4,
  reason: 2,
  analyze: 2,
};

/** Build a deterministic batch of real-shaped requests from the workload mix. */
export function buildRequests(): CostRequest[] {
  const out: CostRequest[] = [];
  for (const cls of Object.keys(MIX) as RequestClass[]) {
    for (let i = 0; i < MIX[cls]; i++) {
      out.push({ id: `${cls}-${i}`, cls, tokens: TOKENS[cls] });
    }
  }
  return out;
}

export { TOKENS as TOKEN_PROFILES, MIX as WORKLOAD_MIX };
