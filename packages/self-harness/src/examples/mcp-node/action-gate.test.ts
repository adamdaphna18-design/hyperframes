import { describe, expect, it } from "vitest";
import {
  evaluateAction,
  guardAction,
  isDestructive,
  newActionContext,
  reconcileEffect,
  type ActionPolicy,
  type GuardedAction,
} from "./action-gate.js";

const POLICY: ActionPolicy = {
  allowedHosts: ["api.internal", "payments.internal"],
  destructiveTools: ["payments.charge"],
  maxActions: 5,
  maxDenials: 3,
  requireIdempotencyKey: true,
};

/** A policy with a generous denial budget, for tests that aren't about the breaker. */
const LENIENT: ActionPolicy = { ...POLICY, maxDenials: 1000 };

const read: GuardedAction = { tool: "users.get", host: "api.internal" };
const charge = (effectId: string): GuardedAction => ({
  tool: "payments.charge",
  host: "payments.internal",
  destructive: true,
  effectId,
});

describe("the gate allows the safe path", () => {
  it("permits a read to an allowed host", () => {
    expect(evaluateAction(read, POLICY, newActionContext()).allow).toBe(true);
  });

  it("permits a first-time destructive write carrying an idempotency key", () => {
    expect(evaluateAction(charge("c1"), POLICY, newActionContext()).allow).toBe(true);
  });
});

describe("issue 1 — the MCP double-charge is vetoed", () => {
  it("blocks a retry of a committed charge, executing it exactly once", async () => {
    const ctx = newActionContext();
    let charges = 0;
    const exec = async () => {
      charges += 1;
      return "ok";
    };

    expect((await guardAction(charge("c1"), exec, LENIENT, ctx)).allowed).toBe(true);
    const retry = await guardAction(charge("c1"), exec, LENIENT, ctx);
    expect(retry.decision.rule).toBe("duplicate-effect");
    expect(charges).toBe(1); // the gate, not the tool, prevented the second charge
  });

  it("requires an idempotency key on destructive actions", () => {
    const noKey: GuardedAction = { tool: "payments.charge", host: "payments.internal" };
    expect(evaluateAction(noKey, POLICY, newActionContext()).rule).toBe("missing-idempotency-key");
  });

  it("a concurrent duplicate is rejected — the reservation beats the race (TOCTOU)", async () => {
    const ctx = newActionContext();
    let charges = 0;
    const slow = async () => {
      await new Promise((r) => setTimeout(r, 5));
      charges += 1;
      return "ok";
    };
    // Both start before either finishes; the id is reserved synchronously, so only one runs.
    const [a, b] = await Promise.all([
      guardAction(charge("race"), slow, LENIENT, ctx),
      guardAction(charge("race"), slow, LENIENT, ctx),
    ]);
    expect([a.allowed, b.allowed].filter(Boolean)).toHaveLength(1);
    expect(charges).toBe(1);
    const denied = a.allowed ? b : a;
    expect(denied.decision.rule).toBe("effect-in-flight");
  });
});

describe("a failed call is UNKNOWN, not 'didn't happen'", () => {
  it("denies a blind retry after a timeout — the write may have landed", async () => {
    const ctx = newActionContext();
    let charges = 0;
    const timeout = async () => {
      charges += 1; // the downstream write may well have committed
      throw new Error("gateway timeout");
    };
    await expect(guardAction(charge("c9"), timeout, LENIENT, ctx)).rejects.toThrow("timeout");
    expect(ctx.effects.get("c9")).toBe("unresolved");

    const blindRetry = await guardAction(charge("c9"), timeout, LENIENT, ctx);
    expect(blindRetry.allowed).toBe(false);
    expect(blindRetry.decision.rule).toBe("effect-unresolved");
    expect(charges).toBe(1); // no double-charge on an unknown outcome
  });

  it("allows the retry only after reconciliation says it did not land", async () => {
    const ctx = newActionContext();
    let attempts = 0;
    const flaky = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("blip");
      return "ok";
    };
    await expect(guardAction(charge("c8"), flaky, LENIENT, ctx)).rejects.toThrow("blip");
    reconcileEffect(ctx, "c8", "not-committed");
    const retry = await guardAction(charge("c8"), flaky, LENIENT, ctx);
    expect(retry.allowed).toBe(true);
  });

  it("reconciling as committed keeps the retry blocked", async () => {
    const ctx = newActionContext();
    const boom = async () => {
      throw new Error("timeout");
    };
    await expect(guardAction(charge("c7"), boom, LENIENT, ctx)).rejects.toThrow();
    reconcileEffect(ctx, "c7", "committed");
    const retry = await guardAction(charge("c7"), boom, LENIENT, ctx);
    expect(retry.decision.rule).toBe("duplicate-effect");
  });
});

describe("issue 2 — the runtime breakout is vetoed", () => {
  it("blocks egress to a host outside the allowlist, regardless of the goal", () => {
    const escape: GuardedAction = { tool: "http.get", host: "huggingface.co" };
    expect(evaluateAction(escape, POLICY, newActionContext()).rule).toBe("egress-allowlist");
  });

  it("treats an undeclared host as unsafe, not as 'local'", () => {
    const hostless: GuardedAction = { tool: "http.get" };
    expect(evaluateAction(hostless, POLICY, newActionContext()).rule).toBe("unknown-host");
    // ...unless the policy explicitly opts in for trusted local tools.
    const lenient = { ...POLICY, allowUndeclaredHost: true };
    expect(evaluateAction(hostless, lenient, newActionContext()).allow).toBe(true);
  });

  it("rejects a host smuggling credentials or a path past the allowlist", () => {
    for (const host of ["api.internal@evil.com", "api.internal/../x", "evil.com:80"]) {
      const spoof: GuardedAction = { tool: "http.get", host };
      expect(evaluateAction(spoof, POLICY, newActionContext()).rule).toBe("unknown-host");
    }
  });

  it("matches the allowlist case-insensitively rather than failing open or closed by luck", () => {
    const upper: GuardedAction = { tool: "http.get", host: "API.Internal" };
    expect(evaluateAction(upper, POLICY, newActionContext()).allow).toBe(true);
  });

  it("halts the session once the denial budget is spent (the 17k-probe trip)", async () => {
    const ctx = newActionContext();
    const exec = async () => "ok";
    const probe: GuardedAction = { tool: "http.get", host: "huggingface.co" };
    for (let i = 0; i < POLICY.maxDenials; i++) {
      await guardAction(probe, exec, POLICY, ctx);
    }
    expect(ctx.halted).toBe(true);
    // Even a previously-legal read is now refused — probing costs the whole session.
    const after = await guardAction(read, exec, POLICY, ctx);
    expect(after.decision.rule).toBe("circuit-open");
  });

  it("caps executed actions independently of denials", async () => {
    const ctx = newActionContext();
    const exec = async () => "ok";
    for (let i = 0; i < POLICY.maxActions; i++) {
      expect((await guardAction(read, exec, LENIENT, ctx)).allowed).toBe(true);
    }
    expect((await guardAction(read, exec, LENIENT, ctx)).decision.rule).toBe("rate-cap");
  });
});

describe("the caller cannot talk its way out of a protected class", () => {
  it("a policy-known destructive tool stays destructive when the action claims otherwise", () => {
    const liar: GuardedAction = {
      tool: "payments.charge",
      host: "payments.internal",
      destructive: false, // the agent's adapter under-reports the risk
    };
    expect(isDestructive(liar, POLICY)).toBe(true);
    expect(evaluateAction(liar, POLICY, newActionContext()).rule).toBe("missing-idempotency-key");
  });

  it("a self-declared destructive flag still escalates an unknown tool", () => {
    const escalated: GuardedAction = {
      tool: "some.writer",
      host: "api.internal",
      destructive: true,
    };
    expect(evaluateAction(escalated, POLICY, newActionContext()).rule).toBe(
      "missing-idempotency-key",
    );
  });
});

describe("every decision is recorded", () => {
  it("writes an append-only audit entry for allows and denies alike", async () => {
    const ctx = newActionContext();
    const exec = async () => "ok";
    await guardAction(read, exec, LENIENT, ctx);
    await guardAction({ tool: "http.get", host: "evil.com" }, exec, LENIENT, ctx);
    expect(ctx.audit.map((e) => [e.seq, e.allowed, e.rule])).toEqual([
      [1, true, "allow"],
      [2, false, "egress-allowlist"],
    ]);
  });
});
