/**
 * A router example inspired by TinyRouter (harrrshall/tinyrouter) and Sakana's
 * Fugu: a tiny decision layer that dispatches each question to the specialist
 * that fits it, beating any single model by smart routing instead of brute force.
 *
 * In this framework the router's whole "intelligence" is its **routing policy** —
 * and that policy is a harness the Self-Harness loop learns and regression-gates.
 * Each specialist answers only questions in its domain; the generalist covers
 * general knowledge and is the default when no route matches. Deterministic and
 * offline; a real drop-in routes to actual models behind the same policy.
 */
export type Domain = "math" | "code" | "reasoning" | "knowledge";

export const DOMAINS: Domain[] = ["math", "code", "reasoning", "knowledge"];

export interface Specialist {
  id: string;
  name: string;
  /** The domains this specialist answers correctly. */
  strengths: Domain[];
}

export const SPECIALISTS: Specialist[] = [
  { id: "generalist", name: "Generalist", strengths: ["knowledge"] },
  { id: "math-pro", name: "Math specialist", strengths: ["math"] },
  { id: "code-pro", name: "Code specialist", strengths: ["code"] },
  { id: "reason-pro", name: "Reasoning specialist", strengths: ["reasoning"] },
];

/** Where an un-routed question goes — a broad but shallow model. */
export const DEFAULT_SPECIALIST = "generalist";

/** The specialist that actually answers each domain — the target the router should learn. */
export const BEST_SPECIALIST: Record<Domain, string> = {
  math: "math-pro",
  code: "code-pro",
  reasoning: "reason-pro",
  knowledge: "generalist",
};

export function specialistById(id: string): Specialist | undefined {
  return SPECIALISTS.find((s) => s.id === id);
}
