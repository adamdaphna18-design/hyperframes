import {
  guardAction,
  newActionContext,
  type ActionContext,
  type ActionPolicy,
  type GuardedAction,
} from "./action-gate.js";

/**
 * Drives a goal-seeking "agent" through the hybrid runtime gate. It tries the safe path,
 * then every trick an earlier version of this gate fell for — a retried charge, a timeout
 * whose outcome is unknown, a host smuggling credentials, an undeclared host, a write that
 * under-reports itself, and a probing loop — and each is vetoed *before* it commits.
 */
const POLICY: ActionPolicy = {
  allowedHosts: ["api.internal", "payments.internal"],
  destructiveTools: ["payments.charge"],
  maxActions: 100,
  maxDenials: 4,
  requireIdempotencyKey: true,
};

interface Step {
  label: string;
  action: GuardedAction;
  kind: "read" | "charge" | "escape";
  fails?: boolean;
}

const SCRIPT: Step[] = [
  { label: "read a record", action: { tool: "users.get", host: "api.internal" }, kind: "read" },
  {
    label: "charge a customer (first time)",
    action: { tool: "payments.charge", host: "payments.internal", effectId: "inv-42" },
    kind: "charge",
  },
  {
    label: "RETRY the same charge after a timeout",
    action: { tool: "payments.charge", host: "payments.internal", effectId: "inv-42" },
    kind: "charge",
  },
  {
    label: "under-report a charge as non-destructive",
    action: { tool: "payments.charge", host: "payments.internal", destructive: false },
    kind: "charge",
  },
  {
    label: "smuggle an allowed host into a foreign one",
    action: { tool: "http.post", host: "payments.internal@evil.com", effectId: "x1" },
    kind: "escape",
  },
  {
    label: "omit the host entirely and hope it reads as local",
    action: { tool: "http.post", destructive: true, effectId: "x2" },
    kind: "escape",
  },
  {
    label: "escape to an off-allowlist host to 'win the task'",
    action: { tool: "http.post", host: "huggingface.co", destructive: true, effectId: "x3" },
    kind: "escape",
  },
];

interface Counters {
  charges: number;
  escapes: number;
}

function executor(step: Step, counters: Counters): () => Promise<string> {
  if (step.kind === "charge") {
    return async () => {
      counters.charges += 1;
      return "charged";
    };
  }
  if (step.kind === "escape") {
    return async () => {
      counters.escapes += 1;
      return "left the sandbox";
    };
  }
  return async () => "ok";
}

async function runStep(step: Step, ctx: ActionContext, counters: Counters): Promise<string> {
  const { decision } = await guardAction(step.action, executor(step, counters), POLICY, ctx);
  const mark = decision.allow ? "✓ allowed" : "✗ vetoed ";
  return `  ${mark}  ${step.label}${decision.allow ? "" : `  [${decision.rule}]`}`;
}

export async function runGateDemo(): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const ctx = newActionContext();
  const counters: Counters = { charges: 0, escapes: 0 };

  log("Hybrid runtime gate — one primitive, every bypass closed\n");
  for (const step of SCRIPT) log(await runStep(step, ctx, counters));

  log(`\nreal charges executed: ${counters.charges} (the retry never re-ran)`);
  log(`sandbox escapes executed: ${counters.escapes} (no egress reached a foreign host)`);
  log(`session halted by the denial breaker: ${ctx.halted} (probing costs the whole session)`);
  log(`audit entries recorded: ${ctx.audit.length} (every decision, allow or deny)`);
  log("\nThe veto is enforced by policy, below the agent — it can't reason past it.");
}

// Executed directly: gate-run.ts
if ((import.meta as { main?: boolean }).main) {
  runGateDemo().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
