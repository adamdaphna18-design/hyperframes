import { describe, expect, test } from "bun:test";
import { createRuntime, BudgetExceededError } from "../src/workflow/runtime.ts";
import { Journal } from "../src/workflow/journal.ts";

describe("runtime.step", () => {
  test("runs a step and returns its value", async () => {
    const rt = createRuntime();
    expect(await rt.step("a", () => 41 + 1)).toBe(42);
  });

  test("caches by journal key (resume replays, does not re-run)", async () => {
    const journal = new Journal({ "s/x": "cached" });
    const rt = createRuntime({ journal });
    let ran = false;
    const v = await rt.step(
      "x",
      () => {
        ran = true;
        return "fresh";
      },
      { phase: "s" },
    );
    expect(v).toBe("cached");
    expect(ran).toBe(false);
    expect(rt.cacheHits()).toBe(1);
  });
});

describe("runtime.parallel", () => {
  test("runs thunks and swallows failures to null", async () => {
    const rt = createRuntime({ concurrency: 2 });
    const out = await rt.parallel([
      async () => 1,
      async () => {
        throw new Error("boom");
      },
      async () => 3,
    ]);
    expect(out).toEqual([1, null, 3]);
  });

  test("respects the concurrency cap", async () => {
    const rt = createRuntime({ concurrency: 2 });
    let active = 0;
    let peak = 0;
    const make = (i: number) => () =>
      rt.step(`t${i}`, async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        return i;
      });
    await rt.parallel([make(1), make(2), make(3), make(4), make(5)]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe("runtime.pipeline", () => {
  test("flows each item through stages, dropping throwers to null", async () => {
    const rt = createRuntime();
    const out = await rt.pipeline(
      [1, 2, 3],
      (_p, n) => n * 10,
      (prev, n) => {
        if (n === 2) throw new Error("skip 2");
        return (prev as number) + n;
      },
    );
    expect(out).toEqual([11, null, 33]);
  });
});

describe("budget", () => {
  test("charges cost and reports remaining", async () => {
    const rt = createRuntime({ budget: 3 });
    await rt.step("a", () => "x", { cost: 2 });
    expect(rt.budget.spent()).toBe(2);
    expect(rt.budget.remaining()).toBe(1);
  });

  test("throws BudgetExceededError past the ceiling", async () => {
    const rt = createRuntime({ budget: 1 });
    await rt.step("a", () => "x", { cost: 1 });
    await expect(rt.step("b", () => "y", { cost: 1 })).rejects.toBeInstanceOf(BudgetExceededError);
  });

  test("unlimited by default", () => {
    const rt = createRuntime();
    expect(rt.budget.total).toBeNull();
    expect(rt.budget.remaining()).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("journal round-trip", () => {
  test("serialises and reloads", () => {
    const j = new Journal();
    j.set("k", { v: 1 });
    const j2 = new Journal(JSON.parse(JSON.stringify(j.toJSON())));
    expect(j2.get<{ v: number }>("k")).toEqual({ hit: true, value: { v: 1 } });
    expect(j2.get("missing")).toEqual({ hit: false });
  });
});
