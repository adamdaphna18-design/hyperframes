import { hexToBigInt, sha256 } from "./hash.js";

/**
 * The Butterfly Engine.
 *
 * ButterflyLedger's thesis: an append-only ledger is a *deterministic chaotic
 * system*. Each block hash is the "initial condition" for the next; the SHA-256
 * chaining function plays the role of the nonlinear map. Two properties of
 * chaos theory map directly onto the ledger's security:
 *
 *   • Sensitive dependence on initial conditions ("the butterfly effect"):
 *     the tiniest change to any historical byte diverges the entire downstream
 *     trajectory. In the ledger this is the SHA-256 avalanche — tamper with one
 *     transaction and every subsequent block hash changes.
 *
 *   • A deterministic, unpredictable trajectory: given the exact same history
 *     you always recompute the same chain, but you cannot shortcut it.
 *
 * This module makes that thesis *measurable*. It seeds the classic logistic
 * map `x → r·x·(1 − x)` (with `r = 3.99`, deep in the chaotic regime) from a
 * block hash and iterates it. The resulting "butterfly signature" is folded
 * back into the block, and the divergence between two nearly-identical seeds
 * quantifies exactly how violently the system reacts to tampering.
 */

/** Logistic-map control parameter, chosen in the chaotic regime (r ∈ (3.57, 4]). */
export const CHAOS_R = 3.99;

/** Number of map iterations used to derive a butterfly signature. */
export const CHAOS_ITERATIONS = 256;

/** Map a hex hash deterministically into the open interval (0, 1). */
export function seedFromHash(hashHex: string): number {
  // Use the low 52 bits so the value fits exactly in a float64 mantissa.
  const mask = (1n << 52n) - 1n;
  const bits = hexToBigInt(sha256(hashHex)) & mask;
  const unit = Number(bits) / Number(1n << 52n);
  // Nudge away from the fixed points 0 and 1.
  return 0.05 + unit * 0.9;
}

/** Iterate the logistic map `n` times from `x0`, returning the trajectory. */
export function logisticTrajectory(x0: number, n: number = CHAOS_ITERATIONS): number[] {
  const traj = new Array<number>(n);
  let x = x0;
  for (let i = 0; i < n; i++) {
    x = CHAOS_R * x * (1 - x);
    traj[i] = x;
  }
  return traj;
}

/**
 * Derive a block's butterfly signature: hash the final chaotic state (rounded
 * to a fixed precision so it is reproducible across platforms) together with
 * the source hash. This binds the block to its position in the chaotic
 * trajectory.
 */
export function butterflySignature(hashHex: string): string {
  const x0 = seedFromHash(hashHex);
  const traj = logisticTrajectory(x0);
  const finalState = traj[traj.length - 1]!.toFixed(12);
  return sha256(`butterfly:${hashHex}:${finalState}`);
}

/** Report of how far two trajectories diverge after a minimal perturbation. */
export interface DivergenceReport {
  /** Iteration at which the two trajectories first differ by ≥ 0.5. */
  readonly separationStep: number;
  /** Final absolute distance between the two trajectories. */
  readonly finalDistance: number;
  /** Empirical largest-Lyapunov-exponent estimate (positive ⇒ chaotic). */
  readonly lyapunovEstimate: number;
}

/**
 * Quantify sensitive dependence: seed two logistic trajectories that differ by
 * a single `epsilon` perturbation and measure how quickly they diverge. A
 * positive Lyapunov estimate is the mathematical fingerprint of the butterfly
 * effect — the same fingerprint SHA-256 chaining gives the ledger.
 */
export function measureDivergence(x0: number, epsilon: number = 1e-12): DivergenceReport {
  let a = x0;
  let b = x0 + epsilon;
  let separationStep = -1;
  let sumLog = 0;
  let counted = 0;
  const n = CHAOS_ITERATIONS;
  for (let i = 0; i < n; i++) {
    a = CHAOS_R * a * (1 - a);
    b = CHAOS_R * b * (1 - b);
    const d = Math.abs(a - b);
    if (d > 0) {
      sumLog += Math.log(d / epsilon);
      counted++;
    }
    if (separationStep < 0 && d >= 0.5) separationStep = i;
  }
  return {
    separationStep,
    finalDistance: Math.abs(a - b),
    lyapunovEstimate: counted > 0 ? sumLog / counted : 0,
  };
}
