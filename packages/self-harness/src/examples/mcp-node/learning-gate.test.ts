import { describe, expect, it } from "vitest";
import type { ActionPolicy, GuardedAction } from "./action-gate.js";
import {
  applyEdit,
  dualGate,
  learnPolicy,
  policyAllows,
  proposeTightenings,
  scorePolicy,
  type Candidate,
  type LabeledAction,
} from "./learning-gate.js";
import { INITIAL_POLICY, buildLearningCorpus } from "./learn-run.js";

const corpus = buildLearningCorpus();

describe("scorePolicy", () => {
  it("scores the loose starting policy on both axes at once", () => {
    const card = scorePolicy(INITIAL_POLICY, corpus);
    // Every legitimate call is served, and nothing legitimate is over-blocked.
    expect(card.served).toBe(4);
    expect(card.overBlocked).toEqual([]);
    // Three of five attacks are already blocked; two sail straight through.
    expect(card.blocked).toBe(3);
    expect(card.openHoles).toEqual(["charge-nokey", "undeclared"]);
  });

  it("counts a benign action denied by an over-tight policy as over-blocked, not blocked", () => {
    // Cut payments.internal: the legitimate charge now fails — a utility regression.
    const tight: ActionPolicy = {
      ...INITIAL_POLICY,
      allowedHosts: INITIAL_POLICY.allowedHosts.filter((h) => h !== "payments.internal"),
    };
    const card = scorePolicy(tight, corpus);
    expect(card.overBlocked).toContain("charge-ok");
    expect(card.served).toBe(3);
  });
});

describe("policyAllows", () => {
  it("reflects the policy's rules, not accumulated session traffic", () => {
    const benign: GuardedAction = { tool: "users.get", host: "api.internal" };
    // Called many times over — a fresh context each call means no rate/denial drift.
    for (let i = 0; i < 50; i++) expect(policyAllows(INITIAL_POLICY, benign)).toBe(true);
  });
});

describe("applyEdit", () => {
  it("never mutates the input policy", () => {
    const before = JSON.stringify(INITIAL_POLICY);
    applyEdit(INITIAL_POLICY, { kind: "require-idempotency-key" });
    applyEdit(INITIAL_POLICY, { kind: "deny-undeclared-host" });
    applyEdit(INITIAL_POLICY, { kind: "add-destructive-tool", tool: "payments.charge" });
    applyEdit(INITIAL_POLICY, { kind: "remove-host", host: "payments.internal" });
    expect(JSON.stringify(INITIAL_POLICY)).toBe(before);
  });
});

describe("proposeTightenings", () => {
  it("closes an undeclared-host hole by denying undeclared hosts", () => {
    const undeclared: GuardedAction = { tool: "http.fetch", destructive: true, effectId: "x1" };
    const candidates = proposeTightenings(undeclared);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.edits).toEqual([{ kind: "deny-undeclared-host" }]);
  });

  it("offers aggressive-then-clean candidates for a write to an allowed host", () => {
    const charge: GuardedAction = { tool: "payments.charge", host: "payments.internal" };
    const candidates = proposeTightenings(charge);
    expect(candidates).toHaveLength(2);
    // The aggressive host cut comes first — the dual gate is expected to reject it.
    expect(candidates[0]?.edits).toEqual([{ kind: "remove-host", host: "payments.internal" }]);
    // The clean requirement comes second.
    expect(candidates[1]?.edits).toEqual([
      { kind: "require-idempotency-key" },
      { kind: "add-destructive-tool", tool: "payments.charge" },
    ]);
  });
});

describe("dualGate", () => {
  it("rejects a candidate that closes the hole but over-blocks legitimate traffic", () => {
    const aggressive: Candidate = {
      label: "cut host 'payments.internal'",
      edits: [{ kind: "remove-host", host: "payments.internal" }],
    };
    const { decision } = dualGate(INITIAL_POLICY, aggressive, corpus);
    expect(decision.accept).toBe(false);
    expect(decision.newOverBlocked).toContain("charge-ok");
    expect(decision.reason).toMatch(/over-block/);
  });

  it("accepts a candidate that closes a hole with zero utility regression", () => {
    const clean: Candidate = {
      label: "require idempotency + mark 'payments.charge' destructive",
      edits: [
        { kind: "require-idempotency-key" },
        { kind: "add-destructive-tool", tool: "payments.charge" },
      ],
    };
    const { decision } = dualGate(INITIAL_POLICY, clean, corpus);
    expect(decision.accept).toBe(true);
    expect(decision.newOverBlocked).toEqual([]);
    expect(decision.reason).toMatch(/accepted/);
  });

  it("rejects a candidate that closes no open hole", () => {
    // Already-blocked attacks aside, this edit shuts nothing new.
    const noop: Candidate = {
      label: "add an unrelated destructive tool",
      edits: [{ kind: "add-destructive-tool", tool: "nonexistent.tool" }],
    };
    const { decision } = dualGate(INITIAL_POLICY, noop, corpus);
    expect(decision.accept).toBe(false);
    expect(decision.reason).toMatch(/closes no open hole/);
  });
});

describe("learnPolicy", () => {
  it("converges to the tightest policy that blocks every attack and serves every legit call", () => {
    const result = learnPolicy(INITIAL_POLICY, corpus);
    expect(result.stoppedBecause).toBe("all holes closed");
    expect(result.final.openHoles).toEqual([]);
    expect(result.final.overBlocked).toEqual([]);
    expect(result.final.served).toBe(4);
    expect(result.final.blocked).toBe(5);
  });

  it("exercises the dual gate both ways: the aggressive candidate is rejected, the clean one accepted", () => {
    const result = learnPolicy(INITIAL_POLICY, corpus);
    // The first round tries the over-blocking host cut (false) then the clean edit (true);
    // the second round accepts deny-undeclared (true).
    expect(result.decisions).toEqual([false, true, true]);
    expect(result.decisions).toContain(false);
    expect(result.decisions).toContain(true);
  });

  it("never regresses either axis — served and blocked only ever rise (dual monotonicity)", () => {
    const result = learnPolicy(INITIAL_POLICY, corpus);
    let served = result.initial.served;
    let blocked = result.initial.blocked;
    for (const round of result.rounds) {
      expect(round.served).toBeGreaterThanOrEqual(served);
      expect(round.blocked).toBeGreaterThanOrEqual(blocked);
      served = round.served;
      blocked = round.blocked;
    }
  });

  it("holds safety monotonicity: every attack blocked at the start stays blocked at the end", () => {
    const result = learnPolicy(INITIAL_POLICY, corpus);
    const attacks = corpus.filter((c: LabeledAction) => c.label === "attack");
    for (const attack of attacks) {
      const blockedAtStart = !policyAllows(INITIAL_POLICY, attack.action);
      if (blockedAtStart) {
        expect(policyAllows(result.finalPolicy, attack.action)).toBe(false);
      }
    }
    // And by the end, all of them are blocked.
    for (const attack of attacks) {
      expect(policyAllows(result.finalPolicy, attack.action)).toBe(false);
    }
  });

  it("keeps utility whole: every legit call served at the start is still served at the end", () => {
    const result = learnPolicy(INITIAL_POLICY, corpus);
    const benign = corpus.filter((c: LabeledAction) => c.label === "benign");
    for (const call of benign) {
      expect(policyAllows(result.finalPolicy, call.action)).toBe(true);
    }
  });

  it("is deterministic — same inputs, identical learned policy and decision trace", () => {
    const a = learnPolicy(INITIAL_POLICY, corpus);
    const b = learnPolicy(INITIAL_POLICY, corpus);
    expect(a.finalPolicy).toEqual(b.finalPolicy);
    expect(a.decisions).toEqual(b.decisions);
    expect(a.rounds).toEqual(b.rounds);
  });

  it("does not mutate the initial policy", () => {
    const before = JSON.stringify(INITIAL_POLICY);
    learnPolicy(INITIAL_POLICY, corpus);
    expect(JSON.stringify(INITIAL_POLICY)).toBe(before);
  });
});
