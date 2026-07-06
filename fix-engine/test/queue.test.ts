import { describe, expect, test } from "bun:test";
import { FixQueue, MemoryStore, type ContextPackage } from "../src/index.ts";

function fixedClock(start = 1_700_000_000_000, step = 1000) {
  let t = start;
  return () => {
    const v = t;
    t += step;
    return v;
  };
}

function makeQueue() {
  const store = new MemoryStore();
  return new FixQueue({ store, now: fixedClock() });
}

const ctx: ContextPackage = {
  route: "/dashboard#inbox",
  tabState: "Notifications",
  selectorChain: ["section#inbox", "div.card:nth-of-type(2)", "button.bell"],
  anchor: "button.bell",
  tag: "button",
  nearbyText: "Enable alerts for window X",
  rect: { x: 120, y: 340, w: 32, h: 32 },
  area: "dashboard/inbox",
  sourceFile: "src/views/Inbox.tsx",
  ts: 1_700_000_000_000,
};

describe("FixQueue — capture", () => {
  test("add lands a card in inbox with a stable id and preserved context", async () => {
    const q = makeQueue();
    const card = await q.add("make the bell badge show a count", ctx);
    expect(card.id).toBe("fix_1");
    expect(card.status).toBe("inbox");
    expect(card.context.sourceFile).toBe("src/views/Inbox.tsx");
    expect(card.note).toBe("make the bell badge show a count");
  });

  test("ids increment monotonically", async () => {
    const q = makeQueue();
    const a = await q.add("one", ctx);
    const b = await q.add("two", ctx);
    expect([a.id, b.id]).toEqual(["fix_1", "fix_2"]);
  });

  test("empty note is rejected", async () => {
    const q = makeQueue();
    await expect(q.add("   ", ctx)).rejects.toThrow(/empty/);
  });
});

describe("FixQueue — agent pull", () => {
  test("pull claims every inbox card into in_progress and returns them", async () => {
    const q = makeQueue();
    await q.add("a", ctx);
    await q.add("b", ctx);
    const claimed = await q.pull();
    expect(claimed.map((c) => c.id)).toEqual(["fix_1", "fix_2"]);
    expect(claimed.every((c) => c.status === "in_progress")).toBe(true);
    expect(await q.list("inbox")).toHaveLength(0);
  });

  test("a second pull returns nothing (no double-processing)", async () => {
    const q = makeQueue();
    await q.add("a", ctx);
    await q.pull();
    expect(await q.pull()).toHaveLength(0);
  });

  test("cards added after a pull are picked up by the next pull", async () => {
    const q = makeQueue();
    await q.add("a", ctx);
    await q.pull();
    await q.add("b", ctx);
    const second = await q.pull();
    expect(second.map((c) => c.id)).toEqual(["fix_2"]);
  });
});

describe("FixQueue — report & completion gate", () => {
  test("report attaches without leaving in_progress", async () => {
    const q = makeQueue();
    const c = await q.add("a", ctx);
    await q.pull();
    const reported = await q.report(c.id, "Added a count badge to the bell.");
    expect(reported.report).toBe("Added a count badge to the bell.");
    expect(reported.status).toBe("in_progress"); // reporting ≠ completing
  });

  test("an agent CANNOT move a card to done", async () => {
    const q = makeQueue();
    const c = await q.add("a", ctx);
    await q.pull();
    await expect(q.move(c.id, "done", "agent")).rejects.toThrow(/only a human/);
    expect(await q.list("done")).toHaveLength(0);
  });

  test("a human CAN move a card to done", async () => {
    const q = makeQueue();
    const c = await q.add("a", ctx);
    await q.pull();
    const done = await q.move(c.id, "done", "human");
    expect(done.status).toBe("done");
    expect(await q.list("done")).toHaveLength(1);
  });

  test("agents may still shuffle between inbox and in_progress", async () => {
    const q = makeQueue();
    const c = await q.add("a", ctx);
    const back = await q.move(c.id, "in_progress", "agent");
    expect(back.status).toBe("in_progress");
  });

  test("reporting an unknown card throws", async () => {
    const q = makeQueue();
    await expect(q.report("fix_999", "x")).rejects.toThrow(/no card/);
  });
});

describe("FixQueue — summary", () => {
  test("counts each column", async () => {
    const q = makeQueue();
    await q.add("a", ctx);
    await q.add("b", ctx);
    await q.pull();
    await q.add("c", ctx);
    expect(await q.summary()).toEqual({ inbox: 1, in_progress: 2, done: 0 });
  });
});
