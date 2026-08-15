import type { Harness, HarnessPatch, PatchOp } from "./types.js";

/**
 * The initial, deliberately naive harness every model in the experiment starts
 * from. `maxToolCalls` is effectively unbounded, failed commands may repeat,
 * and environment does not persist across sessions — the three seams the
 * pathologies exploit.
 */
export function defaultHarness(): Harness {
  return {
    systemPrompt: "You are a capable autonomous agent. Complete the task.",
    rules: [],
    limits: {
      maxToolCalls: 1000,
      avoidRepeatedFailures: false,
      persistEnvAcrossSessions: false,
    },
    tools: ["bash", "read", "write", "edit"],
  };
}

/** Deep-clone a harness so patches never mutate a shared object. */
export function cloneHarness(h: Harness): Harness {
  return {
    systemPrompt: h.systemPrompt,
    rules: [...h.rules],
    limits: { ...h.limits },
    tools: [...h.tools],
  };
}

function applyOp(h: Harness, op: PatchOp): void {
  switch (op.op) {
    case "addRule":
      if (!h.rules.includes(op.text)) h.rules.push(op.text);
      break;
    case "removeRule":
      h.rules = h.rules.filter((r) => r !== op.text);
      break;
    case "setLimit":
      // Assign through each narrowed arm so a mismatched key/value (e.g. a
      // boolean into the numeric `maxToolCalls`) is a compile error, not a
      // silently-coerced guardrail — no `as` cast required.
      if (op.key === "maxToolCalls") h.limits.maxToolCalls = op.value;
      else if (op.key === "avoidRepeatedFailures") h.limits.avoidRepeatedFailures = op.value;
      else h.limits.persistEnvAcrossSessions = op.value;
      break;
    case "setSystemPrompt":
      h.systemPrompt = op.text;
      break;
  }
}

/** Apply a patch to a copy of the harness, returning the new harness. */
export function applyPatch(h: Harness, patch: HarnessPatch): Harness {
  const next = cloneHarness(h);
  for (const op of patch.ops) applyOp(next, op);
  return next;
}

/** A human-readable, one-line-per-change diff between two harnesses. */
export function diffHarness(before: Harness, after: Harness): string[] {
  const lines: string[] = [];
  const limitKeys = ["maxToolCalls", "avoidRepeatedFailures", "persistEnvAcrossSessions"] as const;
  for (const key of limitKeys) {
    if (before.limits[key] !== after.limits[key]) {
      lines.push(`limit ${key}: ${String(before.limits[key])} -> ${String(after.limits[key])}`);
    }
  }
  for (const rule of after.rules) {
    if (!before.rules.includes(rule)) lines.push(`+ rule: ${rule}`);
  }
  for (const rule of before.rules) {
    if (!after.rules.includes(rule)) lines.push(`- rule: ${rule}`);
  }
  if (before.systemPrompt !== after.systemPrompt) lines.push("system prompt rewritten");
  return lines;
}

/** Total edit size of a patch — the loop prefers smaller (more minimal) edits. */
export function patchSize(patch: HarnessPatch): number {
  return patch.ops.reduce((n, op) => {
    if (op.op === "addRule" || op.op === "removeRule" || op.op === "setSystemPrompt") {
      return n + 1 + op.text.length / 200;
    }
    return n + 1;
  }, 0);
}
