import { describe, expect, it } from "vitest";
import {
  evaluateAction,
  guardAction,
  newActionContext,
  type ActionPolicy,
  type GuardedAction,
} from "./action-gate.js";

const POLICY: ActionPolicy = {
  allowedHosts: ["api.internal", "payments.internal"],
  maxActions: 5,
  requireIdempotencyKey: true,
};

const readAction: GuardedAction = { tool: "users.get", host: "api.internal", destructive: false };
const charge = (effectId: string): GuardedAction => ({
  tool: "payments.charge",
  host: "payments.internal",
  destructive: true,
  effectId,
});

describe("the gate allows the safe path", () => {
  it("permits a read-only call to an allowed host", () => {
    const d = evaluateAction(readAction, POLICY, newActionContext());
    expect(d.allow).toBe(true);
  });

  it("permits a first-time destructive write with an idempotency key", () => {
    const d = evaluateAction(charge("c1"), POLICY, newActionContext());
    expect(d.allow).toBe(true);
  });
});

describe("issue 1 — the MCP double-charge is vetoed", () => {
  it("blocks a retry of a charge whose effect already committed, executing it exactly once", async () => {
    const ctx = newActionContext();
    let charges = 0;
    const exec = async () => {
      charges += 1;
      return "ok";
    };

    const first = await guardAction(charge("c1"), exec, POLICY, ctx);
    expect(first.decision.allow).toBe(true);

    // The client times out and retries the same logical charge.
    const retry = await guardAction(charge("c1"), exec, POLICY, ctx);
    expect(retry.decision.allow).toBe(false);
    expect(retry.decision.rule).toBe("duplicate-effect");
    expect(charges).toBe(1); // the gate, not the tool, prevented the second charge
  });

  it("requires an idempotency key on destructive actions", () => {
    const noKey: GuardedAction = {
      tool: "payments.charge",
      host: "payments.internal",
      destructive: true,
    };
    const d = evaluateAction(noKey, POLICY, newActionContext());
    expect(d.allow).toBe(false);
    expect(d.rule).toBe("missing-idempotency-key");
  });
});

describe("issue 2 — the runtime breakout is vetoed", () => {
  it("blocks egress to a host outside the allowlist, regardless of the goal", () => {
    const escape: GuardedAction = { tool: "http.get", host: "huggingface.co", destructive: false };
    const d = evaluateAction(escape, POLICY, newActionContext());
    expect(d.allow).toBe(false);
    expect(d.rule).toBe("egress-allowlist");
  });

  it("halts runaway volume at the cap (the 17k-attempt trip)", async () => {
    const ctx = newActionContext();
    const exec = async () => "ok";
    for (let i = 0; i < POLICY.maxActions; i++) {
      const d = await guardAction({ ...readAction }, exec, POLICY, ctx);
      expect(d.decision.allow).toBe(true);
    }
    const overflow = await guardAction({ ...readAction }, exec, POLICY, ctx);
    expect(overflow.decision.allow).toBe(false);
    expect(overflow.decision.rule).toBe("rate-cap");
  });
});

describe("a genuinely failed effect may still be retried", () => {
  it("does not record an effect whose execution threw, so a real retry is allowed", async () => {
    const ctx = newActionContext();
    let attempts = 0;
    const flaky = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("network blip");
      return "ok";
    };
    await expect(guardAction(charge("c9"), flaky, POLICY, ctx)).rejects.toThrow("network blip");
    // The first attempt failed and committed nothing, so the retry is allowed and succeeds.
    const retry = await guardAction(charge("c9"), flaky, POLICY, ctx);
    expect(retry.decision.allow).toBe(true);
    expect(retry.result).toBe("ok");
  });
});
