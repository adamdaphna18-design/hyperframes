/**
 * Unit tests for the async Semaphore concurrency primitive.
 *
 * Covers the slot accounting (active / waiting counts), FIFO release ordering,
 * and that over-subscribed acquires block until a holder releases.
 */

import { describe, expect, it } from "vitest";
import { Semaphore } from "./semaphore.js";

describe("Semaphore", () => {
  it("grants slots immediately while under the limit", async () => {
    const sem = new Semaphore(2);
    expect(sem.activeCount).toBe(0);

    const a = await sem.acquire();
    const b = await sem.acquire();

    expect(sem.activeCount).toBe(2);
    expect(sem.waitingCount).toBe(0);

    a();
    b();
    expect(sem.activeCount).toBe(0);
  });

  it("queues acquires past the limit and resolves them on release", async () => {
    const sem = new Semaphore(1);
    const first = await sem.acquire();
    expect(sem.activeCount).toBe(1);

    let secondGranted = false;
    const secondPromise = sem.acquire().then((release) => {
      secondGranted = true;
      return release;
    });

    // The second acquire must not resolve while the single slot is held.
    await Promise.resolve();
    expect(secondGranted).toBe(false);
    expect(sem.waitingCount).toBe(1);

    first();
    const secondRelease = await secondPromise;
    expect(secondGranted).toBe(true);
    expect(sem.activeCount).toBe(1);
    expect(sem.waitingCount).toBe(0);

    secondRelease();
    expect(sem.activeCount).toBe(0);
  });

  it("releases waiters in FIFO order", async () => {
    const sem = new Semaphore(1);
    const hold = await sem.acquire();

    const order: number[] = [];
    const p1 = sem.acquire().then((r) => {
      order.push(1);
      return r;
    });
    const p2 = sem.acquire().then((r) => {
      order.push(2);
      return r;
    });
    const p3 = sem.acquire().then((r) => {
      order.push(3);
      return r;
    });

    expect(sem.waitingCount).toBe(3);

    // Drain the queue one slot at a time; each release wakes exactly one waiter
    // in enqueue order.
    hold();
    (await p1)();
    (await p2)();
    (await p3)();

    expect(order).toEqual([1, 2, 3]);
    expect(sem.activeCount).toBe(0);
    expect(sem.waitingCount).toBe(0);
  });

  it("never exceeds the configured concurrency under contention", async () => {
    const sem = new Semaphore(3);
    let active = 0;
    let peak = 0;

    const work = async () => {
      const release = await sem.acquire();
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      release();
    };

    await Promise.all(Array.from({ length: 20 }, () => work()));

    expect(peak).toBeLessThanOrEqual(3);
    expect(sem.activeCount).toBe(0);
  });
});
