import {
  guardAction,
  newActionContext,
  type ActionPolicy,
  type GuardedAction,
} from "./action-gate.js";

/**
 * Drives a goal-seeking "agent" through the hybrid runtime gate. It tries the safe path,
 * then the two failures the industry keeps hitting — a retried charge (the MCP
 * double-charge) and an escape to an off-allowlist host (the OpenAI/Hugging Face
 * breakout) — and the gate vetoes both *before* they commit. Same primitive, both issues.
 */
export async function runGateDemo(): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const policy: ActionPolicy = {
    allowedHosts: ["api.internal", "payments.internal"],
    maxActions: 100,
    requireIdempotencyKey: true,
  };
  const ctx = newActionContext();

  let realCharges = 0;
  let escapes = 0;
  const charge = async () => {
    realCharges += 1;
    return "charged";
  };
  const escape = async () => {
    escapes += 1;
    return "left the sandbox";
  };
  const read = async () => "ok";

  const script: Array<{ label: string; action: GuardedAction; exec: () => Promise<string> }> = [
    {
      label: "read a record",
      action: { tool: "users.get", host: "api.internal", destructive: false },
      exec: read,
    },
    {
      label: "charge a customer (first time)",
      action: {
        tool: "payments.charge",
        host: "payments.internal",
        destructive: true,
        effectId: "inv-42",
      },
      exec: charge,
    },
    {
      label: "RETRY the same charge after a timeout",
      action: {
        tool: "payments.charge",
        host: "payments.internal",
        destructive: true,
        effectId: "inv-42",
      },
      exec: charge,
    },
    {
      label: "escape to an off-allowlist host to 'win the task'",
      action: { tool: "http.post", host: "huggingface.co", destructive: true, effectId: "exfil-1" },
      exec: escape,
    },
  ];

  log("Hybrid runtime gate — one primitive, both failures\n");
  for (const step of script) {
    const { decision } = await guardAction(step.action, step.exec, policy, ctx);
    const mark = decision.allow ? "✓ allowed" : "✗ vetoed ";
    log(`  ${mark}  ${step.label}${decision.allow ? "" : `  [${decision.rule}]`}`);
  }

  log(`\nreal charges executed: ${realCharges} (the retry was stopped — no double-charge)`);
  log(`sandbox escapes executed: ${escapes} (egress to the off-allowlist host was denied)`);
  log("The veto is enforced by policy, below the agent — it can't reason past it.");
}

// Executed directly: gate-run.ts
if ((import.meta as { main?: boolean }).main) {
  runGateDemo().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
