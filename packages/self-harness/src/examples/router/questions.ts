import type { Domain } from "./specialists.js";

/** One benchmark question, tagged with the domain that decides who can answer it. */
export interface Question {
  id: string;
  domain: Domain;
  prompt: string;
}

/** A small mixed benchmark — four domains, four questions each. */
export const QUESTIONS: Question[] = [
  { id: "math-1", domain: "math", prompt: "Integrate x^2 from 0 to 3." },
  { id: "math-2", domain: "math", prompt: "Solve 3x + 7 = 25." },
  { id: "math-3", domain: "math", prompt: "What is the 10th Fibonacci number?" },
  { id: "math-4", domain: "math", prompt: "Probability of two heads in three flips?" },

  { id: "code-1", domain: "code", prompt: "Reverse a linked list in place." },
  { id: "code-2", domain: "code", prompt: "Fix this off-by-one in a binary search." },
  { id: "code-3", domain: "code", prompt: "Write a debounce function." },
  { id: "code-4", domain: "code", prompt: "Explain this stack trace and patch it." },

  { id: "reason-1", domain: "reasoning", prompt: "If all A are B and some B are C, what follows?" },
  { id: "reason-2", domain: "reasoning", prompt: "Plan the cheapest route visiting five cities." },
  { id: "reason-3", domain: "reasoning", prompt: "Spot the flaw in this argument." },
  { id: "reason-4", domain: "reasoning", prompt: "Which assumption breaks the conclusion?" },

  { id: "know-1", domain: "knowledge", prompt: "Who wrote The Brothers Karamazov?" },
  { id: "know-2", domain: "knowledge", prompt: "What is the capital of Australia?" },
  { id: "know-3", domain: "knowledge", prompt: "When did the Bronze Age begin?" },
  { id: "know-4", domain: "knowledge", prompt: "What causes the tides?" },
];
